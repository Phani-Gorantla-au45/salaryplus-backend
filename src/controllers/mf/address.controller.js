import MfUserData from "../../models/mf/mfUserData.model.js";
import { createFpAddress, fetchFpAddress } from "../../utils/mf/address.utils.js";

const NATURE_VALUES = ["residential", "business_location"];

/* ------------------------------------------------------------------ */
/*  Helper — build address object from FP response                      */
/* ------------------------------------------------------------------ */
const addressFromFp = (fpData) => ({
  fpAddressId: fpData.id,
  line1:       fpData.line1       ?? null,
  line2:       fpData.line2       ?? null,
  city:        fpData.city        ?? null,
  state:       fpData.state       ?? null,
  postalCode:  fpData.postal_code ?? null,
  country:     fpData.country     ?? "IN",
  nature:      fpData.nature      ?? "residential",
  rawResponse: fpData,
});

/* ------------------------------------------------------------------ */
/*  POST /api/mf/address                                                */
/* ------------------------------------------------------------------ */
export const createAddress = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { line1, line2, postal_code, nature = "residential" } = req.body;

    if (!line1 || !postal_code) {
      return res.status(400).json({ success: false, message: "line1 and postal_code are required" });
    }

    if (!NATURE_VALUES.includes(nature)) {
      return res.status(400).json({
        success: false,
        message: `nature must be one of: ${NATURE_VALUES.join(", ")}`,
      });
    }

    const mfData = await MfUserData.findOne({ uniqueId });

    const fpInvestorProfileId = mfData?.investorProfile?.fpInvestorProfileId;
    if (!fpInvestorProfileId) {
      return res.status(400).json({
        success: false,
        message: "Investor profile not found. Create one first via POST /api/mf/investor-profile",
      });
    }

    if (mfData?.address?.fpAddressId) {
      return res.status(409).json({
        success: false,
        message:     "Address already linked to this profile",
        fpAddressId: mfData.address.fpAddressId,
      });
    }

    const payload = {
      profile:     fpInvestorProfileId,
      line1:       line1.trim(),
      ...(line2 && { line2: line2.trim() }),
      country:     "IN",
      postal_code: String(postal_code),
      nature,
    };

    const fpData = await createFpAddress(payload);

    const record = await MfUserData.findOneAndUpdate(
      { uniqueId },
      { $set: { address: addressFromFp(fpData) } },
      { upsert: true, new: true }
    );

    return res.status(201).json({
      success: true,
      message: "Address linked to investor profile",
      data: {
        fpAddressId:         record.address.fpAddressId,
        fpInvestorProfileId: fpInvestorProfileId,
        line1:      record.address.line1,
        line2:      record.address.line2,
        city:       record.address.city,
        state:      record.address.state,
        postalCode: record.address.postalCode,
        country:    record.address.country,
        nature:     record.address.nature,
      },
    });
  } catch (err) {
    console.error("❌ [ADDRESS] Create error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/address                                                 */
/* ------------------------------------------------------------------ */
export const getAddress = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const mfData = await MfUserData.findOne({ uniqueId });

    if (!mfData?.address?.fpAddressId) {
      return res.status(404).json({ success: false, message: "No address found" });
    }

    const fpData = await fetchFpAddress(mfData.address.fpAddressId);

    const record = await MfUserData.findOneAndUpdate(
      { uniqueId },
      { $set: { address: addressFromFp(fpData) } },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      data: {
        fpAddressId:         record.address.fpAddressId,
        fpInvestorProfileId: mfData.investorProfile?.fpInvestorProfileId ?? null,
        line1:      record.address.line1,
        line2:      record.address.line2,
        city:       record.address.city,
        state:      record.address.state,
        postalCode: record.address.postalCode,
        country:    record.address.country,
        nature:     record.address.nature,
      },
    });
  } catch (err) {
    console.error("❌ [ADDRESS] Fetch error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
