import MfUserData from "../../models/mf/mfUserData.model.js";
import {
  createFpPhoneNumber,
  fetchFpPhoneNumber,
} from "../../utils/mf/phoneNumber.utils.js";

/* ------------------------------------------------------------------ */
/*  POST /api/mf/phone-number                                           */
/* ------------------------------------------------------------------ */
export const createPhoneNumber = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { isd = "91", number, belongs_to } = req.body;

    if (!number) {
      return res.status(400).json({ success: false, message: "number is required" });
    }

    const mfData = await MfUserData.findOne({ uniqueId });

    /* ---------- INVESTOR PROFILE REQUIRED ---------- */
    const fpInvestorProfileId = mfData?.investorProfile?.fpInvestorProfileId;
    if (!fpInvestorProfileId) {
      return res.status(400).json({
        success: false,
        message: "Investor profile not found. Create one first via POST /api/mf/investor-profile",
      });
    }

    /* ---------- PREVENT DUPLICATE ---------- */
    if (mfData?.phone?.fpPhoneNumberId) {
      return res.status(409).json({
        success: false,
        message:         "Phone number already linked to this profile",
        fpPhoneNumberId: mfData.phone.fpPhoneNumberId,
        number:          mfData.phone.number,
      });
    }

    /* ---------- CALL FP API ---------- */
    const payload = {
      profile:    fpInvestorProfileId,
      isd:        String(isd).replace("+", ""),
      number:     String(number),
      ...(belongs_to && { belongs_to }),
    };

    const fpData = await createFpPhoneNumber(payload);

    /* ---------- PERSIST ---------- */
    const record = await MfUserData.findOneAndUpdate(
      { uniqueId },
      {
        $set: {
          phone: {
            fpPhoneNumberId: fpData.id,
            isd:             fpData.isd,
            number:          fpData.number,
            belongsTo:       fpData.belongs_to ?? null,
            rawResponse:     fpData,
          },
        },
      },
      { upsert: true, new: true }
    );

    return res.status(201).json({
      success: true,
      message: "Phone number linked to investor profile",
      data: {
        fpPhoneNumberId:     record.phone.fpPhoneNumberId,
        fpInvestorProfileId: fpInvestorProfileId,
        isd:                 record.phone.isd,
        number:              record.phone.number,
        belongsTo:           record.phone.belongsTo,
      },
    });
  } catch (err) {
    console.error("❌ [PHONE NUMBER] Create error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/phone-number                                            */
/* ------------------------------------------------------------------ */
export const getPhoneNumber = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const mfData = await MfUserData.findOne({ uniqueId });

    if (!mfData?.phone?.fpPhoneNumberId) {
      return res.status(404).json({ success: false, message: "No phone number found" });
    }

    const fpData = await fetchFpPhoneNumber(mfData.phone.fpPhoneNumberId);

    const record = await MfUserData.findOneAndUpdate(
      { uniqueId },
      {
        $set: {
          phone: {
            fpPhoneNumberId: fpData.id,
            isd:             fpData.isd,
            number:          fpData.number,
            belongsTo:       fpData.belongs_to ?? null,
            rawResponse:     fpData,
          },
        },
      },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      data: {
        fpPhoneNumberId:     record.phone.fpPhoneNumberId,
        fpInvestorProfileId: mfData.investorProfile?.fpInvestorProfileId ?? null,
        isd:                 record.phone.isd,
        number:              record.phone.number,
        belongsTo:           record.phone.belongsTo,
      },
    });
  } catch (err) {
    console.error("❌ [PHONE NUMBER] Fetch error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
