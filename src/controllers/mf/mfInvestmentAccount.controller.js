import MfUserData from "../../models/mf/mfUserData.model.js";
import {
  createFpMfInvestmentAccount,
  fetchFpMfInvestmentAccount,
  updateFpMfInvestmentAccount,
} from "../../utils/mf/mfInvestmentAccount.utils.js";

/* ------------------------------------------------------------------ */
/*  Helper — map FP response → investmentAccount $set fields            */
/* ------------------------------------------------------------------ */
const accountFromFp = (fpData) => {
  const fd = fpData.folio_defaults ?? {};
  return {
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
      nominations_info_visibility:    fd.nominations_info_visibility    ?? null,
    },
    rawResponse: fpData,
  };
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/investment-account                                     */
/* ------------------------------------------------------------------ */
export const createMfInvestmentAccount = async (req, res) => {
  try {
    const { uniqueId } = req.user;

    /* ---------- SINGLE READ — all linked data ---------- */
    const mfData = await MfUserData.findOne({ uniqueId });

    /* ---------- PREVENT DUPLICATE ---------- */
    if (mfData?.investmentAccount?.fpInvestmentAccountId) {
      return res.status(409).json({
        success: false,
        message: "MF investment account already exists",
        fpInvestmentAccountId: mfData.investmentAccount.fpInvestmentAccountId,
      });
    }

    /* ---------- INVESTOR PROFILE IS MANDATORY ---------- */
    const profile     = mfData?.investorProfile;
    const phone       = mfData?.phone;
    const email       = mfData?.email;
    const address     = mfData?.address;
    const bankAccount = mfData?.bankAccount;
    const nominee     = mfData?.nominee;

    if (!profile?.fpInvestorProfileId) {
      return res.status(400).json({
        success: false,
        message: "Investor profile is required. Complete account setup first.",
        missing: ["investor_profile"],
      });
    }

    /* ---------- LOG MISSING OPTIONAL ITEMS ---------- */
    const missing = [];
    if (!phone?.fpPhoneNumberId)    missing.push("phone_number");
    if (!email?.fpEmailAddressId)   missing.push("email_address");
    if (!address?.fpAddressId)      missing.push("address");
    if (!bankAccount?.fpBankAccountId) missing.push("bank_account");
    if (missing.length > 0) {
      console.warn(`⚠️  [MF ACCOUNT] Creating without: ${missing.join(", ")}`);
    }

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

    if (nominee?.fpRelatedPartyId) {
      folio_defaults.nominee1                       = nominee.fpRelatedPartyId;
      folio_defaults.nominee1_allocation_percentage = 100;
    }

    /* ---------- CALL FP API ---------- */
    const payload = {
      primary_investor: profile.fpInvestorProfileId,
      holding_pattern:  "single",
      ...(Object.keys(folio_defaults).length > 0 && { folio_defaults }),
    };

    const fpData = await createFpMfInvestmentAccount(payload);

    const record = await MfUserData.findOneAndUpdate(
      { uniqueId },
      {
        $set: {
          investmentAccount:             accountFromFp(fpData),
          "journey.account.status":      "completed",
          "journey.account.completedAt": new Date(),
          "journey.canInvest":           true,
        },
      },
      { upsert: true, new: true }
    );

    console.log(`✅ [MF ACCOUNT] Journey account stage completed for user: ${uniqueId}`);

    const acc = record.investmentAccount;
    return res.status(201).json({
      success: true,
      message: "MF investment account created successfully",
      data: {
        fpInvestmentAccountId: acc.fpInvestmentAccountId,
        primaryInvestorPan:    acc.primaryInvestorPan,
        holdingPattern:        acc.holdingPattern,
        folioDefaults:         acc.folioDefaults,
        linkedData: {
          investorProfile: profile.fpInvestorProfileId,
          phone:           phone?.fpPhoneNumberId       ?? null,
          email:           email?.fpEmailAddressId      ?? null,
          address:         address?.fpAddressId         ?? null,
          bankAccount:     bankAccount?.fpBankAccountId ?? null,
          nominee:         nominee?.fpRelatedPartyId    ?? null,
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
/*  Re-sync folio_defaults from MfUserData and patch on FP             */
/* ------------------------------------------------------------------ */
export const updateMfInvestmentAccount = async (req, res) => {
  try {
    const { uniqueId } = req.user;

    /* ---------- SINGLE READ ---------- */
    const mfData = await MfUserData.findOne({ uniqueId });

    if (!mfData?.investmentAccount?.fpInvestmentAccountId) {
      return res.status(404).json({
        success: false,
        message: "No MF investment account found. Create one first.",
      });
    }

    const { phone, email, address, bankAccount, nominee } = mfData;

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

    if (nominee?.fpRelatedPartyId) {
      folio_defaults.nominee1                       = nominee.fpRelatedPartyId;
      folio_defaults.nominee1_allocation_percentage = 100;
    }

    /* ---------- PATCH FP + SYNC DB ---------- */
    const fpData = await updateFpMfInvestmentAccount(
      mfData.investmentAccount.fpInvestmentAccountId,
      { folio_defaults }
    );

    const record = await MfUserData.findOneAndUpdate(
      { uniqueId },
      { $set: { investmentAccount: accountFromFp(fpData) } },
      { new: true }
    );

    const acc = record.investmentAccount;
    return res.status(200).json({
      success: true,
      message: "MF investment account updated successfully",
      data: {
        fpInvestmentAccountId: acc.fpInvestmentAccountId,
        holdingPattern:        acc.holdingPattern,
        folioDefaults:         acc.folioDefaults,
      },
    });
  } catch (err) {
    console.error("❌ [MF ACCOUNT] Update error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/investment-account                                      */
/* ------------------------------------------------------------------ */
export const getMfInvestmentAccount = async (req, res) => {
  try {
    const { uniqueId } = req.user;

    const mfData = await MfUserData.findOne({ uniqueId });
    if (!mfData?.investmentAccount?.fpInvestmentAccountId) {
      return res.status(404).json({ success: false, message: "No MF investment account found" });
    }

    const fpData = await fetchFpMfInvestmentAccount(mfData.investmentAccount.fpInvestmentAccountId);

    const record = await MfUserData.findOneAndUpdate(
      { uniqueId },
      { $set: { investmentAccount: accountFromFp(fpData) } },
      { new: true }
    );

    const acc = record.investmentAccount;
    return res.status(200).json({
      success: true,
      data: {
        fpInvestmentAccountId: acc.fpInvestmentAccountId,
        primaryInvestorPan:    acc.primaryInvestorPan,
        fpInvestorProfileId:   mfData.investorProfile?.fpInvestorProfileId ?? null,
        holdingPattern:        acc.holdingPattern,
        folioDefaults:         acc.folioDefaults,
      },
    });
  } catch (err) {
    console.error("❌ [MF ACCOUNT] Fetch error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
