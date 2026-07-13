import MfUserData from "../../../models/mf/mfUserData.model.js";
import {
  createFpBankAccount,
  fetchFpBankAccount,
} from "../../../utils/mf/onboarding/bankAccount.utils.js";
import {
  createBankPreVerification,
  fetchPreVerification,
  uploadPoaFile,
} from "../../../utils/mf/kyc/preVerification.utils.js";
import { syncFolioDefaultsToFp } from "../../../utils/mf/onboarding/investmentAccountSync.utils.js";

const ACCOUNT_TYPES = ["savings", "current", "nre", "nro"];

// Map our account types to Cybrilla's expected account_type values
const CYBRILLA_ACCOUNT_TYPE = {
  savings: "savings",
  current: "current",
  nre:     "nre_savings",
  nro:     "nro_savings",
};

const VERIFY_POLL_MS = 3000;
const VERIFY_MAX_MS = 2 * 60 * 1000; // 2 minutes

/* ------------------------------------------------------------------ */
/*  Internal — poll Cybrilla pre-verification until done or timeout     */
/* ------------------------------------------------------------------ */
const pollVerification = async (pvId) => {
  let pv = await fetchPreVerification(pvId);
  const start = Date.now();
  let pollCount = 0;

  while (pv.status !== "completed" && Date.now() - start < VERIFY_MAX_MS) {
    await new Promise((r) => setTimeout(r, VERIFY_POLL_MS));
    pollCount++;
    pv = await fetchPreVerification(pvId);
    const bankStatus = pv.bank_accounts?.[0]?.status ?? "pending";
    console.log(
      `⏳ [BANK VERIFY] Poll #${pollCount} — pv.status: ${pv.status}, bank: ${bankStatus}`
    );
  }

  return pv;
};

/* ------------------------------------------------------------------ */
/*  Internal — extract bank account result from pre-verification        */
/* ------------------------------------------------------------------ */
const extractBankResult = (pv) => {
  const bankEntry = pv.bank_accounts?.[0] ?? {};
  return {
    pvId:       pv.id,
    pvStatus:   pv.status,            // completed | pending
    status:     bankEntry.status     ?? null, // verified | failed | pending
    code:       bankEntry.code       ?? null, // e.g. verification_attempt_limit_exceeded
    confidence: bankEntry.confidence ?? null, // high | low | null
    reason:     bankEntry.reason     ?? null,
  };
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/bank-account/upload-proof  (NRI only)                 */
/*  Uploads bank proof to Cybrilla's POA file store.                   */
/*  Returns a cybrilla_file_id to pass as bank_proof_id when           */
/*  creating an NRE/NRO bank account.                                   */
/* ------------------------------------------------------------------ */
const POA_ALLOWED_MIME = ["image/jpeg", "image/jpg", "image/png", "application/pdf"];
const POA_MAX_BYTES    = 10 * 1024 * 1024;

export const uploadBankProof = async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, message: "No file uploaded. Use field name 'file'" });
    }
    if (!POA_ALLOWED_MIME.includes(file.mimetype)) {
      return res.status(400).json({ success: false, message: `Invalid file type. Allowed: jpg, png, pdf` });
    }
    if (file.size > POA_MAX_BYTES) {
      return res.status(400).json({ success: false, message: "File size exceeds 10MB limit" });
    }

    const poaData = await uploadPoaFile(file.buffer, file.originalname, file.mimetype);

    return res.status(201).json({
      success: true,
      message: "Bank proof uploaded successfully",
      cybrilla_file_id: poaData.id,
    });
  } catch (err) {
    console.error("❌ [BANK PROOF UPLOAD] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/bank-account                                           */
/* ------------------------------------------------------------------ */
export const createBankAccount = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { account_number, primary_account_holder_name, type, ifsc_code, bank_proof_id } =
      req.body;

    if (
      !account_number ||
      !primary_account_holder_name ||
      !type ||
      !ifsc_code
    ) {
      return res.status(400).json({
        success: false,
        message:
          "account_number, primary_account_holder_name, type, and ifsc_code are required",
      });
    }

    if (!ACCOUNT_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `type must be one of: ${ACCOUNT_TYPES.join(", ")}`,
      });
    }

    const NRI_TYPES = ["nre", "nro"];
    if (NRI_TYPES.includes(type) && !bank_proof_id) {
      return res.status(400).json({
        success: false,
        message: "bank_proof_id (Cybrilla file ID) is required for NRE/NRO accounts. Upload via POST /api/mf/bank-account/upload-proof first.",
      });
    }

    const mfData = await MfUserData.findOne({ uniqueId });

    /* ---------- INVESTOR PROFILE REQUIRED (for pan/name/dob) ---------- */
    const profile = mfData?.investorProfile;
    if (!profile?.fpInvestorProfileId) {
      return res.status(400).json({
        success: false,
        message:
          "Investor profile not found. Create one first via POST /api/mf/investor-profile",
      });
    }

    /* ---------- PREVENT DUPLICATE (allow retry if verification failed) ---------- */
    const existingBa = mfData?.bankAccount;
    if (
      existingBa?.fpBankAccountId &&
      existingBa?.verificationStatus !== "failed"
    ) {
      return res.status(409).json({
        success: false,
        message: "Bank account already linked to this profile",
        fpBankAccountId: existingBa.fpBankAccountId,
        accountNumber: existingBa.accountNumber,
        bankName: existingBa.bankName,
        verification: {
          status: existingBa.verificationStatus ?? null,
          confidence: existingBa.verificationConfidence ?? null,
        },
      });
    }

    /* ---------- STEP 1: VERIFY FIRST via Cybrilla ---------- */
    let bankResult;
    try {
      const cybrillaAccountType = CYBRILLA_ACCOUNT_TYPE[type];
      const pvInitial = await createBankPreVerification(
        profile.pan,
        profile.name,
        profile.dob,
        String(account_number),
        ifsc_code.toUpperCase().trim(),
        cybrillaAccountType,
        bank_proof_id ?? null   // NRE/NRO only; null for savings/current
      );

      // NRE/NRO with proof: Cybrilla returns "accepted" (manual review) — skip polling
      const isManualApproval = NRI_TYPES.includes(type) && pvInitial.status === "accepted";
      const pvFinal = isManualApproval ? pvInitial : await pollVerification(pvInitial.id);
      if (isManualApproval) {
        console.log(`ℹ️  [BANK VERIFY] NRI manual approval — pv status: accepted. Skipping poll, proceeding to FP.`);
      }
      bankResult = extractBankResult(pvFinal);
    } catch (verifyErr) {
      console.error("❌ [BANK VERIFY] Cybrilla verification failed:", verifyErr.message);
      return res.status(502).json({
        success: false,
        message: "Bank verification could not be initiated. Please retry.",
      });
    }

    /* ---------- STEP 2: BLOCK if not verified ---------- */
    if (bankResult.status === "failed") {
      console.warn(`⚠️  [BANK VERIFY] Failed — code: ${bankResult.code}, reason: ${bankResult.reason}`);

      if (bankResult.code === "verification_attempt_limit_exceeded") {
        return res.status(429).json({
          success: false,
          message: "Verification attempts for this bank account have been exceeded. Please contact support or try a different bank account.",
          verification: {
            status: bankResult.status,
            code:   bankResult.code,
            reason: bankResult.reason,
          },
        });
      }

      return res.status(422).json({
        success: false,
        message: "Bank account details could not be verified. Please check your details and try again.",
        verification: {
          status: bankResult.status,
          code:   bankResult.code,
          reason: bankResult.reason,
        },
      });
    }

    // NRI manual approval: "accepted" + bank not "failed" → allow through
    const isNriManualApproval = NRI_TYPES.includes(type) && bankResult.pvStatus === "accepted" && bankResult.status !== "failed";

    if (!isNriManualApproval && (bankResult.pvStatus !== "completed" || bankResult.status !== "verified")) {
      console.warn(`⚠️  [BANK VERIFY] Did not complete in time — status: ${bankResult.status}`);
      return res.status(422).json({
        success: false,
        message: "Bank verification timed out. Please retry.",
        verification: {
          status: bankResult.status ?? "pending",
          reason: bankResult.reason ?? null,
        },
      });
    }

    /* ---------- STEP 3: CREATE FP BANK ACCOUNT (only if verified) ---------- */
    const fpData = await createFpBankAccount({
      profile: profile.fpInvestorProfileId,
      account_number: String(account_number),
      primary_account_holder_name: primary_account_holder_name.trim(),
      type,
      ifsc_code: ifsc_code.toUpperCase().trim(),
    });

    /* ---------- STEP 4: SAVE TO DB ---------- */
    const record = await MfUserData.findOneAndUpdate(
      { uniqueId },
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
            verificationId:           bankResult.pvId,
            verificationStatus:       bankResult.status,
            verificationConfidence:   bankResult.confidence,
            verificationReason:       bankResult.reason,
            rawResponse:              fpData,
          },
        },
      },
      { upsert: true, new: true }
    );

    const ba = record.bankAccount;
    console.log(`✅ [BANK ACCOUNT] Verified and created — confidence: ${bankResult.confidence}`);

    return res.status(201).json({
      success: true,
      message: "Bank account verified and linked successfully",
      data: {
        fpBankAccountId:          ba.fpBankAccountId,
        fpBankAccountOldId:       ba.fpBankAccountOldId ?? null,
        fpInvestorProfileId:      profile.fpInvestorProfileId,
        accountNumber:            ba.accountNumber,
        primaryAccountHolderName: ba.primaryAccountHolderName,
        type:                     ba.type,
        ifscCode:                 ba.ifscCode,
        bankName:                 ba.bankName,
        branchName:               ba.branchName,
        branchCity:               ba.branchCity,
        branchState:              ba.branchState,
        verification: {
          status:     bankResult.status,
          confidence: bankResult.confidence,
          reason:     bankResult.reason,
        },
      },
    });
  } catch (err) {
    console.error("❌ [BANK ACCOUNT] Create error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/bank-account                                            */
/* ------------------------------------------------------------------ */
export const getBankAccount = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const mfData = await MfUserData.findOne({ uniqueId });

    if (!mfData?.bankAccount?.fpBankAccountId) {
      return res
        .status(404)
        .json({ success: false, message: "No bank account found" });
    }

    const fpData = await fetchFpBankAccount(mfData.bankAccount.fpBankAccountId);
    console.log("fpdata", fpData);

    const record = await MfUserData.findOneAndUpdate(
      { uniqueId },
      {
        $set: {
          bankAccount: {
            fpBankAccountId: fpData.id,
            fpBankAccountOldId:
              fpData.old_id ?? mfData.bankAccount.fpBankAccountOldId ?? null,
            accountNumber: fpData.account_number,
            primaryAccountHolderName: fpData.primary_account_holder_name,
            type: fpData.type,
            ifscCode: fpData.ifsc_code,
            bankName: fpData.bank_name ?? null,
            branchName: fpData.branch_name ?? null,
            branchCity: fpData.branch_city ?? null,
            branchState: fpData.branch_state ?? null,
            branchAddress: fpData.branch_address ?? null,
            rawResponse: fpData,
            // Preserve existing verification data
            verificationId: mfData.bankAccount.verificationId ?? null,
            verificationStatus: mfData.bankAccount.verificationStatus ?? null,
            verificationConfidence:
              mfData.bankAccount.verificationConfidence ?? null,
            verificationReason: mfData.bankAccount.verificationReason ?? null,
          },
        },
      },
      { new: true }
    );

    const ba = record.bankAccount;
    return res.status(200).json({
      success: true,
      data: {
        fpBankAccountId: ba.fpBankAccountId,
        fpBankAccountOldId: ba.fpBankAccountOldId ?? null,
        fpInvestorProfileId:
          mfData.investorProfile?.fpInvestorProfileId ?? null,
        accountNumber: ba.accountNumber,
        primaryAccountHolderName: ba.primaryAccountHolderName,
        type: ba.type,
        ifscCode: ba.ifscCode,
        bankName: ba.bankName,
        branchName: ba.branchName,
        branchCity: ba.branchCity,
        branchState: ba.branchState,
        verification: {
          status: ba.verificationStatus ?? null,
          confidence: ba.verificationConfidence ?? null,
          reason: ba.verificationReason ?? null,
        },
      },
    });
  } catch (err) {
    console.error("❌ [BANK ACCOUNT] Fetch error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  PATCH /api/mf/bank-account                                          */
/*  Update the bank account linked to the MF investment account.        */
/*  Same verify + create flow as POST, but:                             */
/*    - No 409 conflict guard — always replaces the existing record     */
/*    - After saving, syncs folio_defaults on FP via PATCH              */
/*      /v2/mf_investment_accounts (payout_bank_account field)          */
/*                                                                      */
/*  Body: { account_number, primary_account_holder_name, type,          */
/*          ifsc_code, bank_proof_id? }                                 */
/* ------------------------------------------------------------------ */
export const updateBankAccount = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { account_number, primary_account_holder_name, type, ifsc_code, bank_proof_id } = req.body;

    /* ---------- VALIDATE ---------- */
    if (!account_number || !primary_account_holder_name || !type || !ifsc_code) {
      return res.status(400).json({
        success: false,
        message: "account_number, primary_account_holder_name, type, and ifsc_code are required",
      });
    }
    if (!ACCOUNT_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `type must be one of: ${ACCOUNT_TYPES.join(", ")}`,
      });
    }

    const NRI_TYPES = ["nre", "nro"];
    if (NRI_TYPES.includes(type) && !bank_proof_id) {
      return res.status(400).json({
        success: false,
        message: "bank_proof_id (Cybrilla file ID) is required for NRE/NRO accounts. Upload via POST /api/mf/bank-account/upload-proof first.",
      });
    }

    const mfData = await MfUserData.findOne({ uniqueId });
    const profile = mfData?.investorProfile;
    if (!profile?.fpInvestorProfileId) {
      return res.status(400).json({
        success: false,
        message: "Investor profile not found. Complete onboarding first.",
      });
    }
    if (!mfData?.investmentAccount?.fpInvestmentAccountId) {
      return res.status(400).json({
        success: false,
        message: "MF investment account not found. Complete account setup before updating bank account.",
      });
    }

    console.log(`\n🔄 [BANK UPDATE] user=${uniqueId} type=${type} ifsc=${ifsc_code}`);

    /* ---------- STEP 1: CYBRILLA PRE-VERIFICATION ---------- */
    let bankResult;
    try {
      const cybrillaAccountType = CYBRILLA_ACCOUNT_TYPE[type];
      const pvInitial = await createBankPreVerification(
        profile.pan,
        profile.name,
        profile.dob,
        String(account_number),
        ifsc_code.toUpperCase().trim(),
        cybrillaAccountType,
        bank_proof_id ?? null
      );

      const isManualApproval = NRI_TYPES.includes(type) && pvInitial.status === "accepted";
      const pvFinal = isManualApproval ? pvInitial : await pollVerification(pvInitial.id);
      if (isManualApproval) {
        console.log(`ℹ️  [BANK UPDATE] NRI manual approval — skipping poll`);
      }
      bankResult = extractBankResult(pvFinal);
    } catch (verifyErr) {
      console.error("❌ [BANK UPDATE] Cybrilla verification failed:", verifyErr.message);
      return res.status(502).json({
        success: false,
        message: "Bank verification could not be initiated. Please retry.",
      });
    }

    /* ---------- STEP 2: BLOCK IF FAILED ---------- */
    if (bankResult.status === "failed") {
      console.warn(`⚠️  [BANK UPDATE] Failed — code: ${bankResult.code}`);
      if (bankResult.code === "verification_attempt_limit_exceeded") {
        return res.status(429).json({
          success: false,
          message: "Verification attempts for this bank account have been exceeded. Please try a different bank account.",
          verification: { status: bankResult.status, code: bankResult.code, reason: bankResult.reason },
        });
      }
      return res.status(422).json({
        success: false,
        message: "Bank account details could not be verified. Please check your details and try again.",
        verification: { status: bankResult.status, code: bankResult.code, reason: bankResult.reason },
      });
    }

    const isNriManualApproval = NRI_TYPES.includes(type) && bankResult.pvStatus === "accepted" && bankResult.status !== "failed";
    if (!isNriManualApproval && (bankResult.pvStatus !== "completed" || bankResult.status !== "verified")) {
      return res.status(422).json({
        success: false,
        message: "Bank verification timed out. Please retry.",
        verification: { status: bankResult.status ?? "pending", reason: bankResult.reason ?? null },
      });
    }

    /* ---------- STEP 3: CREATE FP BANK ACCOUNT ---------- */
    const fpData = await createFpBankAccount({
      profile:                      profile.fpInvestorProfileId,
      account_number:               String(account_number),
      primary_account_holder_name:  primary_account_holder_name.trim(),
      type,
      ifsc_code:                    ifsc_code.toUpperCase().trim(),
    });

    /* ---------- STEP 4: SAVE TO DB (replace existing) ---------- */
    const record = await MfUserData.findOneAndUpdate(
      { uniqueId },
      {
        $set: {
          bankAccount: {
            fpBankAccountId:          fpData.id,
            fpBankAccountOldId:       fpData.old_id ?? null,
            accountNumber:            fpData.account_number,
            primaryAccountHolderName: fpData.primary_account_holder_name,
            type:                     fpData.type,
            ifscCode:                 fpData.ifsc_code,
            bankName:                 fpData.bank_name  ?? null,
            branchName:               fpData.branch_name  ?? null,
            branchCity:               fpData.branch_city  ?? null,
            branchState:              fpData.branch_state ?? null,
            branchAddress:            fpData.branch_address ?? null,
            verificationId:           bankResult.pvId,
            verificationStatus:       bankResult.status,
            verificationConfidence:   bankResult.confidence,
            verificationReason:       bankResult.reason,
            rawResponse:              fpData,
          },
        },
      },
      { new: true }
    );

    /* ---------- STEP 5: SYNC FOLIO DEFAULTS TO FP ---------- */
    // Patches PATCH /v2/mf_investment_accounts with new payout_bank_account
    console.log(`  Syncing folio defaults to FP with new bank account ${fpData.id}...`);
    await syncFolioDefaultsToFp(uniqueId);
    console.log(`✅ [BANK UPDATE] Done — fpBankAccountId=${fpData.id}`);

    const ba = record.bankAccount;
    return res.status(200).json({
      success: true,
      message: "Bank account updated and MF investment account synced successfully",
      data: {
        fpBankAccountId:          ba.fpBankAccountId,
        fpBankAccountOldId:       ba.fpBankAccountOldId ?? null,
        accountNumber:            ba.accountNumber,
        primaryAccountHolderName: ba.primaryAccountHolderName,
        type:                     ba.type,
        ifscCode:                 ba.ifscCode,
        bankName:                 ba.bankName,
        verification: {
          status:     bankResult.status,
          confidence: bankResult.confidence,
          reason:     bankResult.reason,
        },
      },
    });
  } catch (err) {
    console.error("❌ [BANK UPDATE] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
