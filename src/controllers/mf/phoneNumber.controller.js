import PhoneNumber from "../../models/mf/phoneNumber.model.js";
import InvestorProfile from "../../models/mf/investorProfile.model.js";
import {
  createFpPhoneNumber,
  fetchFpPhoneNumber,
} from "../../utils/mf/phoneNumber.utils.js";

/* ------------------------------------------------------------------ */
/*  Helper — sync FP response → DB                                      */
/* ------------------------------------------------------------------ */
const syncToDb = async (uniqueId, fpData) => {
  return PhoneNumber.findOneAndUpdate(
    { fpPhoneNumberId: fpData.id },
    {
      $set: {
        uniqueId,
        fpInvestorProfileId: fpData.profile,
        fpPhoneNumberId:     fpData.id,
        isd:                 fpData.isd,
        number:              fpData.number,
        belongsTo:           fpData.belongs_to ?? null,
        rawResponse:         fpData,
      },
    },
    { upsert: true, new: true }
  );
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/phone-number                                           */
/*  Add a phone number linked to the user's investor profile            */
/* ------------------------------------------------------------------ */
export const createPhoneNumber = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { isd = "91", number, belongs_to } = req.body;

    if (!number) {
      return res.status(400).json({ success: false, message: "number is required" });
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
    const existing = await PhoneNumber.findOne({ uniqueId });
    if (existing?.fpPhoneNumberId) {
      return res.status(409).json({
        success: false,
        message: "Phone number already linked to this profile",
        fpPhoneNumberId: existing.fpPhoneNumberId,
        number:          existing.number,
      });
    }

    /* ---------- CALL FP API ---------- */
    const payload = {
      profile:    profile.fpInvestorProfileId,
      isd:        String(isd).replace("+", ""),
      number:     String(number),
      ...(belongs_to && { belongs_to }),
    };

    const fpData = await createFpPhoneNumber(payload);

    /* ---------- PERSIST ---------- */
    const record = await syncToDb(uniqueId, fpData);

    return res.status(201).json({
      success: true,
      message: "Phone number linked to investor profile",
      data: {
        fpPhoneNumberId:     record.fpPhoneNumberId,
        fpInvestorProfileId: record.fpInvestorProfileId,
        isd:                 record.isd,
        number:              record.number,
        belongsTo:           record.belongsTo,
      },
    });
  } catch (err) {
    console.error("❌ [PHONE NUMBER] Create error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/phone-number                                            */
/*  Fetch the stored phone number for the logged-in user                */
/* ------------------------------------------------------------------ */
export const getPhoneNumber = async (req, res) => {
  try {
    const { uniqueId } = req.user;

    const existing = await PhoneNumber.findOne({ uniqueId });
    if (!existing) {
      return res.status(404).json({ success: false, message: "No phone number found" });
    }

    /* Refresh from FP */
    const fpData = await fetchFpPhoneNumber(existing.fpPhoneNumberId);
    const record = await syncToDb(uniqueId, fpData);

    return res.status(200).json({
      success: true,
      data: {
        fpPhoneNumberId:     record.fpPhoneNumberId,
        fpInvestorProfileId: record.fpInvestorProfileId,
        isd:                 record.isd,
        number:              record.number,
        belongsTo:           record.belongsTo,
      },
    });
  } catch (err) {
    console.error("❌ [PHONE NUMBER] Fetch error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
