import EmailAddress from "../../models/mf/emailAddress.model.js";
import InvestorProfile from "../../models/mf/investorProfile.model.js";
import {
  createFpEmailAddress,
  fetchFpEmailAddress,
} from "../../utils/mf/emailAddress.utils.js";

const syncToDb = async (uniqueId, fpData) => {
  return EmailAddress.findOneAndUpdate(
    { fpEmailAddressId: fpData.id },
    {
      $set: {
        uniqueId,
        fpInvestorProfileId: fpData.profile,
        fpEmailAddressId:    fpData.id,
        email:               fpData.email,
        belongsTo:           fpData.belongs_to ?? null,
        rawResponse:         fpData,
      },
    },
    { upsert: true, new: true }
  );
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/email-address                                          */
/* ------------------------------------------------------------------ */
export const createEmailAddress = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { email, belongs_to } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: "email is required" });
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
    const existing = await EmailAddress.findOne({ uniqueId });
    if (existing?.fpEmailAddressId) {
      return res.status(409).json({
        success: false,
        message: "Email address already linked to this profile",
        fpEmailAddressId: existing.fpEmailAddressId,
        email:            existing.email,
      });
    }

    /* ---------- CALL FP API ---------- */
    const payload = {
      profile:   profile.fpInvestorProfileId,
      email:     email.trim().toLowerCase(),
      ...(belongs_to && { belongs_to }),
    };

    const fpData = await createFpEmailAddress(payload);
    const record = await syncToDb(uniqueId, fpData);

    return res.status(201).json({
      success: true,
      message: "Email address linked to investor profile",
      data: {
        fpEmailAddressId:    record.fpEmailAddressId,
        fpInvestorProfileId: record.fpInvestorProfileId,
        email:               record.email,
        belongsTo:           record.belongsTo,
      },
    });
  } catch (err) {
    console.error("❌ [EMAIL ADDRESS] Create error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/email-address                                           */
/* ------------------------------------------------------------------ */
export const getEmailAddress = async (req, res) => {
  try {
    const { uniqueId } = req.user;

    const existing = await EmailAddress.findOne({ uniqueId });
    if (!existing) {
      return res.status(404).json({ success: false, message: "No email address found" });
    }

    const fpData = await fetchFpEmailAddress(existing.fpEmailAddressId);
    const record = await syncToDb(uniqueId, fpData);

    return res.status(200).json({
      success: true,
      data: {
        fpEmailAddressId:    record.fpEmailAddressId,
        fpInvestorProfileId: record.fpInvestorProfileId,
        email:               record.email,
        belongsTo:           record.belongsTo,
      },
    });
  } catch (err) {
    console.error("❌ [EMAIL ADDRESS] Fetch error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
