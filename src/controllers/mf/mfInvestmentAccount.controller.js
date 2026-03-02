import MfInvestmentAccount from "../../models/mf/mfInvestmentAccount.model.js";
import MfJourney from "../../models/mf/mfJourney.model.js";
import InvestorProfile from "../../models/mf/investorProfile.model.js";
import PhoneNumber from "../../models/mf/phoneNumber.model.js";
import EmailAddress from "../../models/mf/emailAddress.model.js";
import MfAddress from "../../models/mf/address.model.js";
import BankAccount from "../../models/mf/bankAccount.model.js";
import RelatedParty from "../../models/mf/relatedParty.model.js";
import {
  createFpMfInvestmentAccount,
  fetchFpMfInvestmentAccount,
  updateFpMfInvestmentAccount,
} from "../../utils/mf/mfInvestmentAccount.utils.js";

/* ------------------------------------------------------------------ */
/*  Helper — sync FP response → DB                                      */
/* ------------------------------------------------------------------ */
const syncToDb = async (uniqueId, fpData) => {
  const fd = fpData.folio_defaults ?? {};
  return MfInvestmentAccount.findOneAndUpdate(
    { uniqueId },
    {
      $set: {
        uniqueId,
        fpInvestmentAccountId: fpData.id,
        primaryInvestorPan:    fpData.primary_investor_pan,
        fpInvestorProfileId:   fpData.primary_investor,
        holdingPattern:        fpData.holding_pattern,
        folioDefaults: {
          communication_email_address:    fd.communication_email_address    ?? null,
          communication_mobile_number:    fd.communication_mobile_number    ?? null,
          communication_address:          fd.communication_address          ?? null,
          payout_bank_account:            fd.payout_bank_account            ?? null,
          nominee1:                       fd.nominee1                       ?? null,
          nominee1_allocation_percentage: fd.nominee1_allocation_percentage ?? null,
          nominations_info_visibility:    fd.nominations_info_visibility    ?? null,
        },
        rawResponse: fpData,
      },
    },
    { upsert: true, new: true }
  );
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/investment-account                                     */
/*  Creates MF investment account and wires all folio defaults          */
/*  automatically from what's already stored in DB for this user.      */
/* ------------------------------------------------------------------ */
export const createMfInvestmentAccount = async (req, res) => {
  try {
    const { uniqueId } = req.user;

    /* ---------- PREVENT DUPLICATE ---------- */
    const existing = await MfInvestmentAccount.findOne({ uniqueId });
    if (existing?.fpInvestmentAccountId) {
      return res.status(409).json({
        success: false,
        message: "MF investment account already exists",
        fpInvestmentAccountId: existing.fpInvestmentAccountId,
      });
    }

    /* ---------- GATHER ALL LINKED DATA FROM DB ---------- */
    const [profile, phone, email, address, bankAccount, nominees] = await Promise.all([
      InvestorProfile.findOne({ uniqueId }),
      PhoneNumber.findOne({ uniqueId }),
      EmailAddress.findOne({ uniqueId }),
      MfAddress.findOne({ uniqueId }),
      BankAccount.findOne({ uniqueId }),
      RelatedParty.find({ uniqueId }).sort({ createdAt: 1 }),
    ]);

    /* ---------- INVESTOR PROFILE IS MANDATORY ---------- */
    if (!profile?.fpInvestorProfileId) {
      return res.status(400).json({
        success: false,
        message: "Investor profile is required. Complete account setup first.",
        missing: ["investor_profile"],
      });
    }

    /* ---------- LOG WHAT WE HAVE ---------- */
    const missing = [];
    if (!phone?.fpPhoneNumberId)    missing.push("phone_number");
    if (!email?.fpEmailAddressId)   missing.push("email_address");
    if (!address?.fpAddressId)      missing.push("address");
    if (!bankAccount?.fpBankAccountId) missing.push("bank_account");

    if (missing.length > 0) {
      console.warn(`⚠️  [MF ACCOUNT] Creating without: ${missing.join(", ")}`);
    }

    /* ---------- BUILD FOLIO DEFAULTS ---------- */
    // Only include IDs that exist — FP ignores null entries gracefully
    const folio_defaults = {
      nominations_info_visibility: "show_all_nominee_names",
    };

    if (email?.fpEmailAddressId)
      folio_defaults.communication_email_address = email.fpEmailAddressId;

    if (phone?.fpPhoneNumberId)
      folio_defaults.communication_mobile_number = phone.fpPhoneNumberId;

    if (address?.fpAddressId)
      folio_defaults.communication_address = address.fpAddressId;

    if (bankAccount?.fpBankAccountId)
      folio_defaults.payout_bank_account = bankAccount.fpBankAccountId;

    // Only one nominee supported in our app
    const nominee = nominees[0];
    if (nominee?.fpRelatedPartyId) {
      folio_defaults.nominee1 = nominee.fpRelatedPartyId;
      folio_defaults.nominee1_allocation_percentage = 100;
    }

    /* ---------- CALL FP API ---------- */
    const payload = {
      primary_investor: profile.fpInvestorProfileId,
      holding_pattern:  "single",
      ...(Object.keys(folio_defaults).length > 0 && { folio_defaults }),
    };

    const fpData = await createFpMfInvestmentAccount(payload);
    const record = await syncToDb(uniqueId, fpData);

    /* ---------- MARK ACCOUNT STAGE AS COMPLETED IN JOURNEY ---------- */
    await MfJourney.findOneAndUpdate(
      { uniqueId },
      {
        $set: {
          "account.status":      "completed",
          "account.completedAt": new Date(),
          canInvest:             true,
        },
      },
      { upsert: true }
    );

    console.log(`✅ [MF ACCOUNT] Journey account stage completed for user: ${uniqueId}`);

    return res.status(201).json({
      success: true,
      message: "MF investment account created successfully",
      data: {
        fpInvestmentAccountId: record.fpInvestmentAccountId,
        primaryInvestorPan:    record.primaryInvestorPan,
        holdingPattern:        record.holdingPattern,
        folioDefaults:         record.folioDefaults,
        linkedData: {
          investorProfile: profile.fpInvestorProfileId,
          phone:           phone?.fpPhoneNumberId          ?? null,
          email:           email?.fpEmailAddressId         ?? null,
          address:         address?.fpAddressId            ?? null,
          bankAccount:     bankAccount?.fpBankAccountId    ?? null,
          nominee:         nominee?.fpRelatedPartyId       ?? null,
        },
      },
    });
  } catch (err) {
    console.error("❌ [MF ACCOUNT] Create error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  PATCH /api/mf/investment-account                                    */
/*  Re-sync folio_defaults from DB and patch on FP                      */
/* ------------------------------------------------------------------ */
export const updateMfInvestmentAccount = async (req, res) => {
  try {
    const { uniqueId } = req.user;

    const existing = await MfInvestmentAccount.findOne({ uniqueId });
    if (!existing?.fpInvestmentAccountId) {
      return res.status(404).json({
        success: false,
        message: "No MF investment account found. Create one first.",
      });
    }

    /* ---------- GATHER LATEST IDs FROM DB ---------- */
    const [phone, email, address, bankAccount, nominees] = await Promise.all([
      PhoneNumber.findOne({ uniqueId }),
      EmailAddress.findOne({ uniqueId }),
      MfAddress.findOne({ uniqueId }),
      BankAccount.findOne({ uniqueId }),
      RelatedParty.find({ uniqueId }).sort({ createdAt: 1 }),
    ]);

    /* ---------- BUILD FOLIO DEFAULTS ---------- */
    const folio_defaults = {
      nominations_info_visibility: "show_all_nominee_names",
    };

    if (email?.fpEmailAddressId)
      folio_defaults.communication_email_address = email.fpEmailAddressId;

    if (phone?.fpPhoneNumberId)
      folio_defaults.communication_mobile_number = phone.fpPhoneNumberId;

    if (address?.fpAddressId)
      folio_defaults.communication_address = address.fpAddressId;

    if (bankAccount?.fpBankAccountId)
      folio_defaults.payout_bank_account = bankAccount.fpBankAccountId;

    const nominee = nominees[0];
    if (nominee?.fpRelatedPartyId) {
      folio_defaults.nominee1 = nominee.fpRelatedPartyId;
      folio_defaults.nominee1_allocation_percentage = 100;
    }

    if (Object.keys(folio_defaults).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No linked data found to update. Add phone, email, address or bank account first.",
      });
    }

    /* ---------- PATCH FP + SYNC DB ---------- */
    const fpData = await updateFpMfInvestmentAccount(
      existing.fpInvestmentAccountId,
      { folio_defaults }
    );
    const record = await syncToDb(uniqueId, fpData);

    return res.status(200).json({
      success: true,
      message: "MF investment account updated successfully",
      data: {
        fpInvestmentAccountId: record.fpInvestmentAccountId,
        holdingPattern:        record.holdingPattern,
        folioDefaults:         record.folioDefaults,
      },
    });
  } catch (err) {
    console.error("❌ [MF ACCOUNT] Update error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/investment-account                                      */
/*  Fetch stored investment account (refresh from FP)                   */
/* ------------------------------------------------------------------ */
export const getMfInvestmentAccount = async (req, res) => {
  try {
    const { uniqueId } = req.user;

    const existing = await MfInvestmentAccount.findOne({ uniqueId });
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "No MF investment account found",
      });
    }

    const fpData = await fetchFpMfInvestmentAccount(existing.fpInvestmentAccountId);
    const record = await syncToDb(uniqueId, fpData);

    return res.status(200).json({
      success: true,
      data: {
        fpInvestmentAccountId: record.fpInvestmentAccountId,
        primaryInvestorPan:    record.primaryInvestorPan,
        fpInvestorProfileId:   record.fpInvestorProfileId,
        holdingPattern:        record.holdingPattern,
        folioDefaults:         record.folioDefaults,
      },
    });
  } catch (err) {
    console.error("❌ [MF ACCOUNT] Fetch error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
