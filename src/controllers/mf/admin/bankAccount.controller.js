import MfUserData from "../../../models/mf/mfUserData.model.js";
import {
  createFpBankAccount,
  fetchFpBankAccount,
} from "../../../utils/mf/onboarding/bankAccount.utils.js";
import {
  createBankPreVerification,
  fetchPreVerification,
} from "../../../utils/mf/kyc/preVerification.utils.js";
import { syncFolioDefaultsToFp } from "../../../utils/mf/onboarding/investmentAccountSync.utils.js";

const ACCOUNT_TYPES = ["savings", "current", "nre", "nro"];
const NRI_TYPES     = ["nre", "nro"];

const CYBRILLA_ACCOUNT_TYPE = {
  savings: "savings",
  current: "current",
  nre:     "nre_savings",
  nro:     "nro_savings",
};

const VERIFY_POLL_MS = 3000;
const VERIFY_MAX_MS  = 2 * 60 * 1000;

const pollVerification = async (pvId) => {
  let pv = await fetchPreVerification(pvId);
  const start = Date.now();
  let pollCount = 0;
  while (pv.status !== "completed" && Date.now() - start < VERIFY_MAX_MS) {
    await new Promise((r) => setTimeout(r, VERIFY_POLL_MS));
    pollCount++;
    pv = await fetchPreVerification(pvId);
    console.log(`⏳ [ADMIN BANK UPDATE] Poll #${pollCount} — pv.status: ${pv.status}, bank: ${pv.bank_accounts?.[0]?.status ?? "pending"}`);
  }
  return pv;
};

const extractBankResult = (pv) => {
  const bankEntry = pv.bank_accounts?.[0] ?? {};
  return {
    pvId:       pv.id,
    pvStatus:   pv.status,
    status:     bankEntry.status     ?? null,
    code:       bankEntry.code       ?? null,
    confidence: bankEntry.confidence ?? null,
    reason:     bankEntry.reason     ?? null,
  };
};

/* ------------------------------------------------------------------ */
/*  PATCH /api/mf/admin/bank-account                                    */
/*  Admin updates a user's MF bank account and syncs folio defaults.   */
/*                                                                      */
/*  Body: {                                                             */
/*    uniqueId*                      — target user                     */
/*    account_number*                                                   */
/*    primary_account_holder_name*                                      */
/*    type*                          — savings | current | nre | nro   */
/*    ifsc_code*                                                        */
/*    bank_proof_id?                 — required for NRE/NRO             */
/*  }                                                                   */
/* ------------------------------------------------------------------ */
export const adminUpdateBankAccount = async (req, res) => {
  try {
    const {
      uniqueId,
      account_number,
      primary_account_holder_name,
      type,
      ifsc_code,
      bank_proof_id,
    } = req.body;

    /* ---------- VALIDATE ---------- */
    if (!uniqueId) {
      return res.status(400).json({ success: false, message: "uniqueId is required" });
    }
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
    if (NRI_TYPES.includes(type) && !bank_proof_id) {
      return res.status(400).json({
        success: false,
        message: "bank_proof_id is required for NRE/NRO accounts. Upload via POST /api/mf/bank-account/upload-proof first.",
      });
    }

    /* ---------- LOAD USER DATA ---------- */
    const mfData = await MfUserData.findOne({ uniqueId });
    if (!mfData) {
      return res.status(404).json({ success: false, message: `No MF data found for uniqueId: ${uniqueId}` });
    }

    const profile = mfData?.investorProfile;
    if (!profile?.fpInvestorProfileId) {
      return res.status(400).json({ success: false, message: "Investor profile not found for this user" });
    }
    if (!mfData?.investmentAccount?.fpInvestmentAccountId) {
      return res.status(400).json({ success: false, message: "MF investment account not found for this user" });
    }

    console.log(`\n🔄 [ADMIN BANK UPDATE] uniqueId=${uniqueId} type=${type} ifsc=${ifsc_code}`);

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
        console.log(`ℹ️  [ADMIN BANK UPDATE] NRI manual approval — skipping poll`);
      }
      bankResult = extractBankResult(pvFinal);
    } catch (verifyErr) {
      console.error("❌ [ADMIN BANK UPDATE] Cybrilla verification failed:", verifyErr.message);
      return res.status(502).json({ success: false, message: "Bank verification could not be initiated. Please retry." });
    }

    /* ---------- STEP 2: BLOCK IF FAILED ---------- */
    if (bankResult.status === "failed") {
      console.warn(`⚠️  [ADMIN BANK UPDATE] Failed — code: ${bankResult.code}`);
      if (bankResult.code === "verification_attempt_limit_exceeded") {
        return res.status(429).json({
          success: false,
          message: "Verification attempts for this bank account have been exceeded.",
          verification: { status: bankResult.status, code: bankResult.code, reason: bankResult.reason },
        });
      }
      return res.status(422).json({
        success: false,
        message: "Bank account details could not be verified. Please check the details and try again.",
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
      profile:                     profile.fpInvestorProfileId,
      account_number:              String(account_number),
      primary_account_holder_name: primary_account_holder_name.trim(),
      type,
      ifsc_code:                   ifsc_code.toUpperCase().trim(),
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
            bankName:                 fpData.bank_name    ?? null,
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
    console.log(`  Syncing folio defaults — new payout_bank_account=${fpData.id}`);
    await syncFolioDefaultsToFp(uniqueId);
    console.log(`✅ [ADMIN BANK UPDATE] Done — fpBankAccountId=${fpData.id}`);

    const ba = record.bankAccount;
    return res.status(200).json({
      success: true,
      message: `Bank account updated and MF investment account synced for user ${uniqueId}`,
      data: {
        uniqueId,
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
    console.error("❌ [ADMIN BANK UPDATE] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/admin/bank-account?uniqueId=xxx                         */
/*  Fetch the current bank account on file for a user (from FP).       */
/* ------------------------------------------------------------------ */
export const adminGetBankAccount = async (req, res) => {
  try {
    const { uniqueId } = req.query;
    if (!uniqueId) {
      return res.status(400).json({ success: false, message: "uniqueId query param is required" });
    }

    const mfData = await MfUserData.findOne({ uniqueId });
    if (!mfData?.bankAccount?.fpBankAccountId) {
      return res.status(404).json({ success: false, message: "No bank account found for this user" });
    }

    const fpData = await fetchFpBankAccount(mfData.bankAccount.fpBankAccountId);
    const ba = mfData.bankAccount;

    return res.status(200).json({
      success: true,
      data: {
        uniqueId,
        fpBankAccountId:          ba.fpBankAccountId,
        fpBankAccountOldId:       ba.fpBankAccountOldId ?? null,
        accountNumber:            fpData.account_number ?? ba.accountNumber,
        primaryAccountHolderName: fpData.primary_account_holder_name ?? ba.primaryAccountHolderName,
        type:                     fpData.type ?? ba.type,
        ifscCode:                 fpData.ifsc_code ?? ba.ifscCode,
        bankName:                 fpData.bank_name ?? ba.bankName,
        branchCity:               fpData.branch_city ?? ba.branchCity,
        verification: {
          status:     ba.verificationStatus     ?? null,
          confidence: ba.verificationConfidence ?? null,
          reason:     ba.verificationReason     ?? null,
        },
      },
    });
  } catch (err) {
    console.error("❌ [ADMIN BANK GET] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
