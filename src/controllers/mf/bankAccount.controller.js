import MfUserData from "../../models/mf/mfUserData.model.js";
import { createFpBankAccount, fetchFpBankAccount } from "../../utils/mf/bankAccount.utils.js";
import {
  createBankPreVerification,
  fetchPreVerification,
} from "../../utils/mf/preVerification.utils.js";

const ACCOUNT_TYPES = ["savings", "current", "nre", "nro"];

// Cybrilla only supports savings/current as-is; nre/nro not handled
const CYBRILLA_ACCOUNT_TYPE = {
  savings: "savings",
  current: "current",
};

const VERIFY_POLL_MS = 3000;
const VERIFY_MAX_MS  = 2 * 60 * 1000; // 2 minutes

/* ------------------------------------------------------------------ */
/*  Internal — poll Cybrilla pre-verification until done or timeout     */
/* ------------------------------------------------------------------ */
const pollVerification = async (pvId) => {
  let pv        = await fetchPreVerification(pvId);
  const start   = Date.now();
  let pollCount = 0;

  while (pv.status !== "completed" && (Date.now() - start) < VERIFY_MAX_MS) {
    await new Promise((r) => setTimeout(r, VERIFY_POLL_MS));
    pollCount++;
    pv = await fetchPreVerification(pvId);
    const bankStatus = pv.bank_accounts?.[0]?.status ?? "pending";
    console.log(`⏳ [BANK VERIFY] Poll #${pollCount} — pv.status: ${pv.status}, bank: ${bankStatus}`);
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
    pvStatus:   pv.status,           // completed | pending
    status:     bankEntry.status     ?? null,  // verified | failed | pending
    confidence: bankEntry.confidence ?? null,  // high | low | null
    reason:     bankEntry.reason     ?? null,
  };
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/bank-account                                           */
/* ------------------------------------------------------------------ */
export const createBankAccount = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { account_number, primary_account_holder_name, type, ifsc_code } = req.body;

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

    const mfData = await MfUserData.findOne({ uniqueId });

    /* ---------- INVESTOR PROFILE REQUIRED (for pan/name/dob) ---------- */
    const profile = mfData?.investorProfile;
    if (!profile?.fpInvestorProfileId) {
      return res.status(400).json({
        success: false,
        message: "Investor profile not found. Create one first via POST /api/mf/investor-profile",
      });
    }

    /* ---------- PREVENT DUPLICATE (allow retry if verification failed) ---------- */
    const existingBa = mfData?.bankAccount;
    if (existingBa?.fpBankAccountId && existingBa?.verificationStatus !== "failed") {
      return res.status(409).json({
        success: false,
        message:         "Bank account already linked to this profile",
        fpBankAccountId: existingBa.fpBankAccountId,
        accountNumber:   existingBa.accountNumber,
        bankName:        existingBa.bankName,
        verification: {
          status:     existingBa.verificationStatus     ?? null,
          confidence: existingBa.verificationConfidence ?? null,
        },
      });
    }

    /* ---------- CREATE BANK ACCOUNT ON FP ---------- */
    const fpData = await createFpBankAccount({
      profile:                     profile.fpInvestorProfileId,
      account_number:              String(account_number),
      primary_account_holder_name: primary_account_holder_name.trim(),
      type,
      ifsc_code:                   ifsc_code.toUpperCase().trim(),
    });

    /* ---------- SAVE BANK ACCOUNT TO DB ---------- */
    await MfUserData.findOneAndUpdate(
      { uniqueId },
      {
        $set: {
          bankAccount: {
            fpBankAccountId:          fpData.id,
            fpBankAccountOldId:       fpData.old_id          ?? null,
            accountNumber:            fpData.account_number,
            primaryAccountHolderName: fpData.primary_account_holder_name,
            type:                     fpData.type,
            ifscCode:                 fpData.ifsc_code,
            bankName:                 fpData.bank_name      ?? null,
            branchName:               fpData.branch_name    ?? null,
            branchCity:               fpData.branch_city    ?? null,
            branchState:              fpData.branch_state   ?? null,
            branchAddress:            fpData.branch_address ?? null,
            rawResponse:              fpData,
          },
        },
      },
      { upsert: true }
    );

    /* ---------- VERIFY VIA CYBRILLA PRE-VERIFICATION ---------- */
    let bankResult;
    try {
      const cybrillaAccountType = CYBRILLA_ACCOUNT_TYPE[type] ?? type;
      const pvInitial = await createBankPreVerification(
        profile.pan,
        profile.name,
        profile.dob,
        String(account_number),
        ifsc_code.toUpperCase().trim(),
        cybrillaAccountType
      );
      const pvFinal   = await pollVerification(pvInitial.id);
      bankResult      = extractBankResult(pvFinal);
    } catch (verifyErr) {
      console.error("❌ [BANK VERIFY] Cybrilla verification failed:", verifyErr.message);
      return res.status(502).json({
        success: false,
        message: "Bank account was created but verification could not be initiated. Please retry.",
        fpBankAccountId: fpData.id,
      });
    }

    /* ---------- SAVE VERIFICATION RESULT ---------- */
    const record = await MfUserData.findOneAndUpdate(
      { uniqueId },
      {
        $set: {
          "bankAccount.verificationId":         bankResult.pvId,
          "bankAccount.verificationStatus":     bankResult.status,
          "bankAccount.verificationConfidence": bankResult.confidence,
          "bankAccount.verificationReason":     bankResult.reason,
        },
      },
      { new: true }
    );

    const ba = record.bankAccount;

    /* ---------- HANDLE VERIFICATION FAILURE ---------- */
    if (bankResult.status === "failed") {
      console.warn(`⚠️  [BANK VERIFY] Failed — reason: ${bankResult.reason}`);
      return res.status(422).json({
        success:         false,
        message:         "Bank account could not be verified. Please try a different bank account.",
        reason:          bankResult.reason,
        canRetry:        false,
        fpBankAccountId: ba.fpBankAccountId,
        accountNumber:   ba.accountNumber,
        bankName:        ba.bankName,
      });
    }

    /* ---------- TIMEOUT / PENDING ---------- */
    if (bankResult.pvStatus !== "completed" || bankResult.status === null) {
      console.warn(`⚠️  [BANK VERIFY] Still pending after timeout`);
    }

    const isVerified = bankResult.status === "verified";
    console.log(`✅ [BANK ACCOUNT] Created — verified: ${isVerified}, confidence: ${bankResult.confidence}`);

    return res.status(201).json({
      success: true,
      message: isVerified
        ? "Bank account linked and verified successfully"
        : "Bank account linked. Verification is in progress.",
      data: {
        fpBankAccountId:          ba.fpBankAccountId,
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
      return res.status(404).json({ success: false, message: "No bank account found" });
    }

    const fpData = await fetchFpBankAccount(mfData.bankAccount.fpBankAccountId);

    const record = await MfUserData.findOneAndUpdate(
      { uniqueId },
      {
        $set: {
          bankAccount: {
            fpBankAccountId:          fpData.id,
            fpBankAccountOldId:       fpData.old_id ?? mfData.bankAccount.fpBankAccountOldId ?? null,
            accountNumber:            fpData.account_number,
            primaryAccountHolderName: fpData.primary_account_holder_name,
            type:                     fpData.type,
            ifscCode:                 fpData.ifsc_code,
            bankName:                 fpData.bank_name      ?? null,
            branchName:               fpData.branch_name    ?? null,
            branchCity:               fpData.branch_city    ?? null,
            branchState:              fpData.branch_state   ?? null,
            branchAddress:            fpData.branch_address ?? null,
            rawResponse:              fpData,
            // Preserve existing verification data
            verificationId:         mfData.bankAccount.verificationId         ?? null,
            verificationStatus:     mfData.bankAccount.verificationStatus     ?? null,
            verificationConfidence: mfData.bankAccount.verificationConfidence ?? null,
            verificationReason:     mfData.bankAccount.verificationReason     ?? null,
          },
        },
      },
      { new: true }
    );

    const ba = record.bankAccount;
    return res.status(200).json({
      success: true,
      data: {
        fpBankAccountId:          ba.fpBankAccountId,
        fpInvestorProfileId:      mfData.investorProfile?.fpInvestorProfileId ?? null,
        accountNumber:            ba.accountNumber,
        primaryAccountHolderName: ba.primaryAccountHolderName,
        type:                     ba.type,
        ifscCode:                 ba.ifscCode,
        bankName:                 ba.bankName,
        branchName:               ba.branchName,
        branchCity:               ba.branchCity,
        branchState:              ba.branchState,
        verification: {
          status:     ba.verificationStatus     ?? null,
          confidence: ba.verificationConfidence ?? null,
          reason:     ba.verificationReason     ?? null,
        },
      },
    });
  } catch (err) {
    console.error("❌ [BANK ACCOUNT] Fetch error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
