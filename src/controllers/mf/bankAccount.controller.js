import BankAccount from "../../models/mf/bankAccount.model.js";
import InvestorProfile from "../../models/mf/investorProfile.model.js";
import { createFpBankAccount, fetchFpBankAccount } from "../../utils/mf/bankAccount.utils.js";

const ACCOUNT_TYPES = ["savings", "current", "nre", "nro"];

const syncToDb = async (uniqueId, fpData) => {
  return BankAccount.findOneAndUpdate(
    { fpBankAccountId: fpData.id },
    {
      $set: {
        uniqueId,
        fpInvestorProfileId:         fpData.profile,
        fpBankAccountId:             fpData.id,
        accountNumber:               fpData.account_number,
        primaryAccountHolderName:    fpData.primary_account_holder_name,
        type:                        fpData.type,
        ifscCode:                    fpData.ifsc_code,
        bankName:                    fpData.bank_name      ?? null,
        branchName:                  fpData.branch_name    ?? null,
        branchCity:                  fpData.branch_city    ?? null,
        branchState:                 fpData.branch_state   ?? null,
        branchAddress:               fpData.branch_address ?? null,
        rawResponse:                 fpData,
      },
    },
    { upsert: true, new: true }
  );
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/bank-account                                           */
/* ------------------------------------------------------------------ */
export const createBankAccount = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { account_number, primary_account_holder_name, type, ifsc_code } = req.body;

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

    /* ---------- GET INVESTOR PROFILE ---------- */
    const profile = await InvestorProfile.findOne({ uniqueId });
    if (!profile?.fpInvestorProfileId) {
      return res.status(400).json({
        success: false,
        message: "Investor profile not found. Create one first via POST /api/mf/investor-profile",
      });
    }

    /* ---------- PREVENT DUPLICATE ---------- */
    const existing = await BankAccount.findOne({ uniqueId });
    if (existing?.fpBankAccountId) {
      return res.status(409).json({
        success: false,
        message: "Bank account already linked to this profile",
        fpBankAccountId: existing.fpBankAccountId,
        accountNumber:   existing.accountNumber,
        bankName:        existing.bankName,
      });
    }

    /* ---------- CALL FP API ---------- */
    const payload = {
      profile:                      profile.fpInvestorProfileId,
      account_number:               String(account_number),
      primary_account_holder_name:  primary_account_holder_name.trim(),
      type,
      ifsc_code:                    ifsc_code.toUpperCase().trim(),
    };

    const fpData = await createFpBankAccount(payload);
    const record = await syncToDb(uniqueId, fpData);

    return res.status(201).json({
      success: true,
      message: "Bank account linked to investor profile",
      data: {
        fpBankAccountId:           record.fpBankAccountId,
        fpInvestorProfileId:       record.fpInvestorProfileId,
        accountNumber:             record.accountNumber,
        primaryAccountHolderName:  record.primaryAccountHolderName,
        type:                      record.type,
        ifscCode:                  record.ifscCode,
        bankName:                  record.bankName,
        branchName:                record.branchName,
        branchCity:                record.branchCity,
        branchState:               record.branchState,
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

    const existing = await BankAccount.findOne({ uniqueId });
    if (!existing) {
      return res.status(404).json({ success: false, message: "No bank account found" });
    }

    const fpData = await fetchFpBankAccount(existing.fpBankAccountId);
    const record = await syncToDb(uniqueId, fpData);

    return res.status(200).json({
      success: true,
      data: {
        fpBankAccountId:           record.fpBankAccountId,
        fpInvestorProfileId:       record.fpInvestorProfileId,
        accountNumber:             record.accountNumber,
        primaryAccountHolderName:  record.primaryAccountHolderName,
        type:                      record.type,
        ifscCode:                  record.ifscCode,
        bankName:                  record.bankName,
        branchName:                record.branchName,
        branchCity:                record.branchCity,
        branchState:               record.branchState,
      },
    });
  } catch (err) {
    console.error("❌ [BANK ACCOUNT] Fetch error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
