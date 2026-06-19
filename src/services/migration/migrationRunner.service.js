import crypto from "crypto";

import RegistrationUser from "../../models/user/user.model.js";
import MfUserData from "../../models/mf/mfUserData.model.js";

import {
  createPreVerification,
  fetchPreVerification,
  createBankPreVerification,
} from "../../utils/mf/kyc/preVerification.utils.js";
import { createFpInvestorProfile } from "../../utils/mf/onboarding/investorProfile.utils.js";
import { createFpPhoneNumber } from "../../utils/mf/onboarding/phoneNumber.utils.js";
import { createFpEmailAddress } from "../../utils/mf/onboarding/emailAddress.utils.js";
import { createFpAddress } from "../../utils/mf/onboarding/address.utils.js";
import { createFpBankAccount } from "../../utils/mf/onboarding/bankAccount.utils.js";
import { createFpRelatedParty } from "../../utils/mf/onboarding/relatedParty.utils.js";
import {
  createFpMfInvestmentAccount,
  listFpMfInvestmentAccounts,
  updateFpMfInvestmentAccount,
} from "../../utils/mf/onboarding/mfInvestmentAccount.utils.js";

import { MIGRATION_DEFAULTS } from "../../config/migrationDefaults.config.js";

/**
 * Migrates one BSE/RTA "Client Master Report" row into this platform —
 * registration, PAN/KRA verification, then full FP MF account setup —
 * by driving the exact same FP/Cybrilla util functions the live onboarding
 * controllers use, just without the OTP ceremony (these users already
 * verified their phone/email/PAN on the old platform).
 *
 * Every sub-step checks for an already-existing FP object before creating
 * a new one, so re-running a partially-failed record is always safe.
 */

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_TIME_MS = 2 * 60 * 1000;
const CYBRILLA_ACCOUNT_TYPE = { savings: "savings", current: "current" };

const generateUniqueId = () => {
  const timePart = Date.now().toString(36);
  const randomPart = crypto.randomBytes(5).toString("hex");
  return "U" + timePart + randomPart;
};

const markStep = async (record, stepName, status, error = null) => {
  record.steps[stepName].status = status;
  record.steps[stepName].error = error;
  record.steps[stepName].completedAt = ["success", "skipped"].includes(status) ? new Date() : null;
  record.lastAttemptAt = new Date();
  await record.save();
};

/* ================================================================
 * STEP 1 — Registration (no OTP; user already verified on old platform)
 * ================================================================ */
const runRegistrationStep = async (record, input) => {
  if (record.steps.registration.status === "success") return;

  try {
    let user = await RegistrationUser.findOne({ phone: input.phone });

    if (!user) {
      user = new RegistrationUser({ phone: input.phone });
      user.uniqueId = undefined; // sparse unique index — must stay undefined, not null
    }

    const [firstName, ...rest] = input.fullName.split(" ");
    user.First_name = firstName;
    user.Last_name  = rest.join(" ") || "";
    if (input.email) user.email = input.email;
    user.isVerified = true;
    user.fromSipway = true; // marks this as a migrated account
    user.otp = null;
    user.otpExpiry = null;

    if (!user.uniqueId) user.uniqueId = generateUniqueId();

    await user.save();

    record.uniqueId = user.uniqueId;
    record.name = input.fullName;
    await markStep(record, "registration", "success");
  } catch (err) {
    await markStep(record, "registration", "failed", err.message);
    throw err;
  }
};

/* ================================================================
 * STEP 2 — PAN / KRA verification via Cybrilla pre-verification
 * ================================================================ */
const runPanVerificationStep = async (record, input) => {
  if (record.steps.panVerification.status === "success") return;

  try {
    const existing = await MfUserData.findOne({ uniqueId: record.uniqueId });
    if (existing?.kycStatus?.overallStatus === "VERIFIED") {
      await markStep(record, "panVerification", "success");
      return;
    }

    const pv = await createPreVerification(input.pan, input.fullName, input.dob);
    let latestPv = pv;
    const start = Date.now();
    while (Date.now() - start < MAX_POLL_TIME_MS && latestPv.status !== "completed") {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      latestPv = await fetchPreVerification(pv.id);
    }

    const panResult       = latestPv.pan           || {};
    const nameResult      = latestPv.name          || {};
    const dobResult       = latestPv.date_of_birth || {};
    const readinessResult = latestPv.readiness     || {};

    let overallStatus;
    if (latestPv.status !== "completed") overallStatus = "PENDING";
    else if (panResult.status === "failed")  overallStatus = "PAN_FAILED";
    else if (nameResult.status === "failed") overallStatus = "NAME_MISMATCH";
    else if (dobResult.status === "failed")  overallStatus = "DOB_MISMATCH";
    else if (panResult.status === "verified" && nameResult.status === "verified" && dobResult.status === "verified")
      overallStatus = "VERIFIED";
    else overallStatus = "ERROR";

    await MfUserData.findOneAndUpdate(
      { uniqueId: record.uniqueId },
      {
        $set: {
          kycStatus: {
            pan: input.pan,
            name: input.fullName,
            dob: input.dob,
            preVerificationId: pv.id,
            overallStatus,
            panStatus:  panResult.status       ?? null,
            panCode:    panResult.code         ?? null,
            nameStatus: nameResult.status      ?? null,
            nameCode:   nameResult.code        ?? null,
            dobStatus:  dobResult.status       ?? null,
            dobCode:    dobResult.code         ?? null,
            kraStatus:  readinessResult.status ?? null,
            kraCode:    readinessResult.code   ?? null,
            kraReason:  readinessResult.reason ?? null,
            rawResponse:   latestPv,
            lastCheckedAt: new Date(),
          },
        },
      },
      { upsert: true },
    );

    await RegistrationUser.findOneAndUpdate(
      { uniqueId: record.uniqueId },
      {
        $set: {
          ...(panResult.status === "verified"       && { panVerified: true }),
          ...(readinessResult.status === "verified"  && { isVerified: true }),
        },
      },
    );

    if (overallStatus !== "VERIFIED") {
      throw new Error(`PAN verification: ${overallStatus} (pan:${panResult.status ?? "-"}, name:${nameResult.status ?? "-"}, dob:${dobResult.status ?? "-"})`);
    }

    await markStep(record, "panVerification", "success");
  } catch (err) {
    await markStep(record, "panVerification", "failed", err.message);
    throw err;
  }
};

/* ================================================================
 * STEP 3a — Investor Profile (mandatory — everything else depends on it)
 * ================================================================ */
const runInvestorProfileStep = async (record, input) => {
  if (record.steps.investorProfile.status === "success") return;

  try {
    const mfData = await MfUserData.findOne({ uniqueId: record.uniqueId });
    if (mfData?.investorProfile?.fpInvestorProfileId) {
      await markStep(record, "investorProfile", "success");
      return;
    }

    const payload = {
      type: "individual",
      tax_status: input.taxStatus,
      name: input.fullName,
      date_of_birth: input.dob,
      gender: input.gender,
      occupation: input.occupation,
      pan: input.pan,
      country_of_birth: "IN",
      place_of_birth: "IN",
      use_default_tax_residences: false,
      first_tax_residency: { country: "IN", taxid_type: "pan", taxid_number: input.pan },
      source_of_wealth: MIGRATION_DEFAULTS.sourceOfWealth,
      income_slab:       MIGRATION_DEFAULTS.incomeSlab,
      pep_details:       MIGRATION_DEFAULTS.pepDetails,
    };

    const fpData = await createFpInvestorProfile(payload);

    await MfUserData.findOneAndUpdate(
      { uniqueId: record.uniqueId },
      {
        $set: {
          investorProfile: {
            fpInvestorProfileId: fpData.id,
            type:              fpData.type,
            taxStatus:         fpData.tax_status,
            name:              fpData.name,
            dob:               fpData.date_of_birth,
            gender:            fpData.gender,
            occupation:        fpData.occupation,
            pan:               fpData.pan,
            countryOfBirth:    fpData.country_of_birth ?? "IN",
            placeOfBirth:      fpData.place_of_birth   ?? "IN",
            firstTaxResidency: fpData.first_tax_residency ?? null,
            sourceOfWealth:    fpData.source_of_wealth,
            incomeSlab:        fpData.income_slab,
            pepDetails:        fpData.pep_details,
            rawResponse:       fpData,
          },
        },
      },
      { upsert: true },
    );

    await markStep(record, "investorProfile", "success");
  } catch (err) {
    await markStep(record, "investorProfile", "failed", err.message);
    throw err;
  }
};

/* ================================================================
 * STEP 3b — Phone (blocking — failure stops the pipeline)
 * ================================================================ */
const runPhoneStep = async (record, input) => {
  if (["success", "skipped"].includes(record.steps.phone.status)) return;

  try {
    const mfData = await MfUserData.findOne({ uniqueId: record.uniqueId });
    if (mfData?.phone?.fpPhoneNumberId) {
      await markStep(record, "phone", "success");
      return;
    }

    const fpInvestorProfileId = mfData?.investorProfile?.fpInvestorProfileId;
    if (!fpInvestorProfileId) throw new Error("Investor profile missing");

    const fpData = await createFpPhoneNumber({ profile: fpInvestorProfileId, isd: "91", number: input.phone });

    await MfUserData.findOneAndUpdate(
      { uniqueId: record.uniqueId },
      {
        $set: {
          phone: {
            fpPhoneNumberId: fpData.id,
            isd:             fpData.isd,
            number:          fpData.number,
            belongsTo:       fpData.belongs_to ?? null,
            otpVerified:     true,
            rawResponse:     fpData,
          },
        },
      },
    );

    await markStep(record, "phone", "success");
  } catch (err) {
    await markStep(record, "phone", "failed", err.message);
    throw err;
  }
};

/* ================================================================
 * STEP 3c — Email (blocking — failure stops the pipeline)
 * ================================================================ */
const runEmailStep = async (record, input) => {
  if (["success", "skipped"].includes(record.steps.email.status)) return;

  if (!input.email) {
    await markStep(record, "email", "skipped", "No email in source data");
    return;
  }

  try {
    const mfData = await MfUserData.findOne({ uniqueId: record.uniqueId });
    if (mfData?.email?.fpEmailAddressId) {
      await markStep(record, "email", "success");
      return;
    }

    const fpInvestorProfileId = mfData?.investorProfile?.fpInvestorProfileId;
    if (!fpInvestorProfileId) throw new Error("Investor profile missing");

    const fpData = await createFpEmailAddress({ profile: fpInvestorProfileId, email: input.email });

    await MfUserData.findOneAndUpdate(
      { uniqueId: record.uniqueId },
      {
        $set: {
          email: {
            fpEmailAddressId: fpData.id,
            email:            fpData.email,
            belongsTo:        fpData.belongs_to ?? null,
            otpVerified:      true,
            rawResponse:      fpData,
          },
        },
      },
    );

    await markStep(record, "email", "success");
  } catch (err) {
    await markStep(record, "email", "failed", err.message);
    throw err;
  }
};

/* ================================================================
 * STEP 3d — Address (blocking — failure stops the pipeline)
 * ================================================================ */
const runAddressStep = async (record, input) => {
  if (["success", "skipped"].includes(record.steps.address.status)) return;

  if (!input.address) {
    await markStep(record, "address", "skipped", "No address in source data");
    return;
  }

  try {
    const mfData = await MfUserData.findOne({ uniqueId: record.uniqueId });
    if (mfData?.address?.fpAddressId) {
      await markStep(record, "address", "success");
      return;
    }

    const fpInvestorProfileId = mfData?.investorProfile?.fpInvestorProfileId;
    if (!fpInvestorProfileId) throw new Error("Investor profile missing");

    const payload = {
      profile: fpInvestorProfileId,
      line1:   input.address.line1,
      ...(input.address.line2 && { line2: input.address.line2 }),
      country:     "IN",
      postal_code: input.address.postalCode,
      nature:      "residential",
    };

    const fpData = await createFpAddress(payload);

    await MfUserData.findOneAndUpdate(
      { uniqueId: record.uniqueId },
      {
        $set: {
          address: {
            fpAddressId: fpData.id,
            line1:       fpData.line1       ?? null,
            line2:       fpData.line2       ?? null,
            city:        fpData.city        ?? null,
            state:       fpData.state       ?? null,
            postalCode:  fpData.postal_code ?? null,
            country:     fpData.country     ?? "IN",
            nature:      fpData.nature      ?? "residential",
            rawResponse: fpData,
          },
        },
      },
    );

    await markStep(record, "address", "success");
  } catch (err) {
    await markStep(record, "address", "failed", err.message);
    throw err;
  }
};

/* ================================================================
 * STEP 3e — Bank Account (blocking — verify via Cybrilla, then create on FP)
 * ================================================================ */
const runBankAccountStep = async (record, input) => {
  if (["success", "skipped"].includes(record.steps.bankAccount.status)) return;

  if (!input.bank) {
    await markStep(record, "bankAccount", "skipped", "No bank details in source data");
    return;
  }

  try {
    const mfData = await MfUserData.findOne({ uniqueId: record.uniqueId });
    if (mfData?.bankAccount?.fpBankAccountId) {
      await markStep(record, "bankAccount", "success");
      return;
    }

    const profile = mfData?.investorProfile;
    if (!profile?.fpInvestorProfileId) throw new Error("Investor profile missing");

    const cybrillaType = CYBRILLA_ACCOUNT_TYPE[input.bank.type] ?? input.bank.type;
    const pvInitial = await createBankPreVerification(
      profile.pan, profile.name, profile.dob,
      input.bank.accountNumber, input.bank.ifscCode, cybrillaType,
    );

    let pv = pvInitial;
    const start = Date.now();
    while (Date.now() - start < MAX_POLL_TIME_MS && pv.status !== "completed") {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      pv = await fetchPreVerification(pvInitial.id);
    }

    const bankEntry = pv.bank_accounts?.[0] ?? {};
    if (pv.status !== "completed" || bankEntry.status !== "verified") {
      throw new Error(`Bank verification: ${bankEntry.status ?? "timeout"} — ${bankEntry.reason ?? "no reason given"}`);
    }

    const fpData = await createFpBankAccount({
      profile:                       profile.fpInvestorProfileId,
      account_number:                input.bank.accountNumber,
      primary_account_holder_name:   input.bank.holderName,
      type:                          input.bank.type,
      ifsc_code:                     input.bank.ifscCode,
    });

    await MfUserData.findOneAndUpdate(
      { uniqueId: record.uniqueId },
      {
        $set: {
          bankAccount: {
            fpBankAccountId:          fpData.id,
            fpBankAccountOldId:       fpData.old_id ?? null,
            accountNumber:            fpData.account_number,
            primaryAccountHolderName: fpData.primary_account_holder_name,
            type:                     fpData.type,
            ifscCode:                 fpData.ifsc_code,
            bankName:                 fpData.bank_name ?? null,
            branchName:               fpData.branch_name ?? null,
            branchCity:               fpData.branch_city ?? null,
            branchState:              fpData.branch_state ?? null,
            branchAddress:            fpData.branch_address ?? null,
            verificationId:           pv.id,
            verificationStatus:       bankEntry.status,
            verificationConfidence:   bankEntry.confidence ?? null,
            verificationReason:       bankEntry.reason ?? null,
            rawResponse:              fpData,
          },
        },
      },
    );

    await markStep(record, "bankAccount", "success");
  } catch (err) {
    await markStep(record, "bankAccount", "failed", err.message);
    throw err;
  }
};

/* ================================================================
 * STEP 3f — Nominee (blocking once attempted; skipped entirely if the
 * source data has no usable nominee — see fieldMapper.service.js)
 * ================================================================ */
const runNomineeStep = async (record, input) => {
  if (["success", "skipped"].includes(record.steps.nominee.status)) return;

  if (!input.nominee) {
    await markStep(record, "nominee", "skipped", input.nomineeSkipReason || "No nominee in source data");
    return;
  }

  try {
    const mfData = await MfUserData.findOne({ uniqueId: record.uniqueId });
    if (mfData?.nominee?.fpRelatedPartyId) {
      await markStep(record, "nominee", "success");
      return;
    }

    const fpInvestorProfileId = mfData?.investorProfile?.fpInvestorProfileId;
    if (!fpInvestorProfileId) throw new Error("Investor profile missing");

    const payload = {
      profile:       fpInvestorProfileId,
      name:          input.nominee.name,
      relationship:  input.nominee.relationship,
      pan:           input.nominee.pan,
      ...(input.nominee.dob && { date_of_birth: input.nominee.dob }), // optional per FP docs
      email_address: input.nominee.emailAddress,
      phone_number:  { isd: "+91", number: input.nominee.phoneNumber },
      address: {
        line1:       input.nominee.line1,
        line2:       input.nominee.line2,
        city:        input.nominee.city,
        postal_code: input.nominee.pincode,
        country:     "IN",
      },
    };

    const fpData = await createFpRelatedParty(payload);

    await MfUserData.findOneAndUpdate(
      { uniqueId: record.uniqueId },
      {
        $set: {
          nominee: {
            fpRelatedPartyId:  fpData.id,
            name:              fpData.name,
            relationship:      fpData.relationship,
            dob:               fpData.date_of_birth ?? null,
            isMinor:           false,
            pan:               fpData.pan ?? null,
            identityProofType: "pan",
            emailAddress:      fpData.email_address ?? null,
            phoneNumber:       fpData.phone_number?.number ?? null,
            address: {
              line1:   fpData.address?.line1       ?? null,
              line2:   fpData.address?.line2       ?? null,
              city:    fpData.address?.city        ?? null,
              pincode: fpData.address?.postal_code ?? null,
              state:   fpData.address?.state       ?? null,
              country: fpData.address?.country     ?? "IN",
            },
            rawResponse: fpData,
          },
        },
      },
    );

    await markStep(record, "nominee", "success");
  } catch (err) {
    // FP docs list date_of_birth as optional, but it occasionally rejects
    // a nominee for lacking one anyway. That's a known, unfixable source-data
    // gap (the report often doesn't capture adult nominee DOB) — skip rather
    // than blocking the whole migration. Any other nominee error still blocks.
    const isDobMandatoryError = !input.nominee.dob && /date_of_birth/i.test(err.message) && /mandatory/i.test(err.message);
    if (isDobMandatoryError) {
      await markStep(record, "nominee", "skipped", `FP rejected nominee without date_of_birth (source data has none): ${err.message}`);
      return;
    }

    await markStep(record, "nominee", "failed", err.message);
    throw err;
  }
};

/* ================================================================
 * STEP 3g — Investment Account (mandatory; final step)
 * Mirrors the live controller's "check FP for existing account by PAN,
 * patch if found else create" logic so pre-loaded FP accounts merge
 * correctly instead of duplicating.
 * ================================================================ */
const runInvestmentAccountStep = async (record) => {
  if (record.steps.investmentAccount.status === "success") return;

  try {
    const mfData = await MfUserData.findOne({ uniqueId: record.uniqueId });
    if (mfData?.investmentAccount?.fpInvestmentAccountId) {
      await markStep(record, "investmentAccount", "success");
      return;
    }

    const profile = mfData?.investorProfile;
    if (!profile?.fpInvestorProfileId) throw new Error("Investor profile is required");

    const { phone, email, address, bankAccount, nominee } = mfData;

    const folio_defaults = { nominations_info_visibility: "show_all_nominee_names" };
    if (email?.fpEmailAddressId)       folio_defaults.communication_email_address = email.fpEmailAddressId;
    if (phone?.fpPhoneNumberId)        folio_defaults.communication_mobile_number = phone.fpPhoneNumberId;
    if (address?.fpAddressId)          folio_defaults.communication_address = address.fpAddressId;
    if (bankAccount?.fpBankAccountId)  folio_defaults.payout_bank_account = bankAccount.fpBankAccountId;
    if (nominee?.fpRelatedPartyId) {
      folio_defaults.nominee1 = nominee.fpRelatedPartyId;
      folio_defaults.nominee1_allocation_percentage = 100;
      if (nominee.identityProofType) folio_defaults.nominee1_identity_proof_type = nominee.identityProofType;
    }

    const pan = profile.pan ?? mfData?.kycStatus?.pan ?? null;
    let fpData;
    let isExistingFpAccount = false;

    if (pan) {
      try {
        const fpList = await listFpMfInvestmentAccounts({
          primary_investor_pan: pan.toUpperCase().trim(),
          holding_pattern:      "single",
        });
        const existing = fpList?.data?.[0] ?? null;
        if (existing) {
          fpData = await updateFpMfInvestmentAccount(existing.id, {
            primary_investor: profile.fpInvestorProfileId,
            folio_defaults,
          });
          isExistingFpAccount = true;
        }
      } catch {
        // No existing FP account found — fall through to create
      }
    }

    if (!fpData) {
      fpData = await createFpMfInvestmentAccount({
        primary_investor: profile.fpInvestorProfileId,
        holding_pattern:  "single",
        ...(Object.keys(folio_defaults).length > 0 && { folio_defaults }),
      });
    }

    const fd = fpData.folio_defaults ?? {};
    await MfUserData.findOneAndUpdate(
      { uniqueId: record.uniqueId },
      {
        $set: {
          investmentAccount: {
            fpInvestmentAccountId:    fpData.id,
            fpInvestmentAccountOldId: fpData.old_id ?? null,
            primaryInvestorPan:       fpData.primary_investor_pan,
            holdingPattern:            fpData.holding_pattern,
            folioDefaults: {
              communication_email_address:    fd.communication_email_address    ?? null,
              communication_mobile_number:    fd.communication_mobile_number    ?? null,
              communication_address:          fd.communication_address          ?? null,
              payout_bank_account:            fd.payout_bank_account            ?? null,
              nominee1:                       fd.nominee1                       ?? null,
              nominee1_allocation_percentage: fd.nominee1_allocation_percentage ?? null,
              nominee1_identity_proof_type:   fd.nominee1_identity_proof_type   ?? null,
              nominations_info_visibility:    fd.nominations_info_visibility    ?? null,
            },
            rawResponse: fpData,
          },
          "journey.account.status":      "completed",
          "journey.account.completedAt": new Date(),
          "journey.canInvest":           true,
        },
      },
    );

    const userUpdate = { mfAccount: "yes" };
    if (isExistingFpAccount) userUpdate.fromSipway = true;
    await RegistrationUser.findOneAndUpdate({ uniqueId: record.uniqueId }, { $set: userUpdate });

    await markStep(record, "investmentAccount", "success");
  } catch (err) {
    await markStep(record, "investmentAccount", "failed", err.message);
    throw err;
  }
};

/* ================================================================
 * Orchestrator
 *
 * Every step is blocking — a single failure anywhere stops the whole
 * pipeline (subsequent steps stay "pending") and the record is marked
 * "failed". The only step that's allowed to not run is "nominee", and
 * only when the source data has no usable nominee at all — that's a
 * "skipped" step, not a failure, and does not block account creation.
 * ================================================================ */
const ALL_STEPS = [
  "registration", "panVerification", "investorProfile",
  "phone", "email", "address", "bankAccount", "nominee",
  "investmentAccount",
];

const recomputeOverallStatus = (record) => {
  if (ALL_STEPS.some((s) => record.steps[s].status === "failed")) {
    record.overallStatus = "failed";
    return;
  }
  const allDone = ALL_STEPS.every((s) => ["success", "skipped"].includes(record.steps[s].status));
  record.overallStatus = allDone ? "completed" : "in_progress";
};

/**
 * Runs (or resumes) the full migration pipeline for one record.
 * Safe to call repeatedly — every step skips work that's already done.
 */
export const processMigrationRecord = async (record, mappedInput) => {
  if (["completed", "manual_review"].includes(record.overallStatus)) return record;

  record.overallStatus = "in_progress";
  await record.save();

  try {
    await runRegistrationStep(record, mappedInput);
    await runPanVerificationStep(record, mappedInput);
    await runInvestorProfileStep(record, mappedInput);
    await runPhoneStep(record, mappedInput);
    await runEmailStep(record, mappedInput);
    await runAddressStep(record, mappedInput);
    await runBankAccountStep(record, mappedInput);
    await runNomineeStep(record, mappedInput);
    await runInvestmentAccountStep(record);
  } catch {
    // A required step already marked itself failed — stop here.
  }

  recomputeOverallStatus(record);
  await record.save();
  return record;
};
