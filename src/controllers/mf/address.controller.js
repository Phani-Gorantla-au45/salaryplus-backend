import MfAddress from "../../models/mf/address.model.js";
import InvestorProfile from "../../models/mf/investorProfile.model.js";
import { createFpAddress, fetchFpAddress } from "../../utils/mf/address.utils.js";

const NATURE_VALUES = ["residential", "business_location"];

const syncToDb = async (uniqueId, fpData) => {
  return MfAddress.findOneAndUpdate(
    { fpAddressId: fpData.id },
    {
      $set: {
        uniqueId,
        fpInvestorProfileId: fpData.profile,
        fpAddressId:         fpData.id,
        line1:      fpData.line1      ?? null,
        line2:      fpData.line2      ?? null,
        city:       fpData.city       ?? null,
        state:      fpData.state      ?? null,
        postalCode: fpData.postal_code ?? null,
        country:    fpData.country    ?? "IN",
        nature:     fpData.nature     ?? "residential",
        rawResponse: fpData,
      },
    },
    { upsert: true, new: true }
  );
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/address                                                */
/* ------------------------------------------------------------------ */
export const createAddress = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { line1, line2, postal_code, nature = "residential" } = req.body;

    if (!line1 || !postal_code) {
      return res.status(400).json({
        success: false,
        message: "line1 and postal_code are required",
      });
    }

    if (!NATURE_VALUES.includes(nature)) {
      return res.status(400).json({
        success: false,
        message: `nature must be one of: ${NATURE_VALUES.join(", ")}`,
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
    const existing = await MfAddress.findOne({ uniqueId });
    if (existing?.fpAddressId) {
      return res.status(409).json({
        success: false,
        message: "Address already linked to this profile",
        fpAddressId: existing.fpAddressId,
      });
    }

    /* ---------- CALL FP API ---------- */
    const payload = {
      profile:     profile.fpInvestorProfileId,
      line1:       line1.trim(),
      ...(line2 && { line2: line2.trim() }),
      country:     "IN",
      postal_code: String(postal_code),
      nature,
    };

    const fpData = await createFpAddress(payload);
    const record = await syncToDb(uniqueId, fpData);

    return res.status(201).json({
      success: true,
      message: "Address linked to investor profile",
      data: {
        fpAddressId:         record.fpAddressId,
        fpInvestorProfileId: record.fpInvestorProfileId,
        line1:      record.line1,
        line2:      record.line2,
        city:       record.city,
        state:      record.state,
        postalCode: record.postalCode,
        country:    record.country,
        nature:     record.nature,
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

    const existing = await MfAddress.findOne({ uniqueId });
    if (!existing) {
      return res.status(404).json({ success: false, message: "No address found" });
    }

    const fpData = await fetchFpAddress(existing.fpAddressId);
    const record = await syncToDb(uniqueId, fpData);

    return res.status(200).json({
      success: true,
      data: {
        fpAddressId:         record.fpAddressId,
        fpInvestorProfileId: record.fpInvestorProfileId,
        line1:      record.line1,
        line2:      record.line2,
        city:       record.city,
        state:      record.state,
        postalCode: record.postalCode,
        country:    record.country,
        nature:     record.nature,
      },
    });
  } catch (err) {
    console.error("❌ [ADDRESS] Fetch error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
