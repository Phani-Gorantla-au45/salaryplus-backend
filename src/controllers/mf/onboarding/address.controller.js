import MfUserData from "../../../models/mf/mfUserData.model.js";
import { createFpAddress, fetchFpAddress } from "../../../utils/mf/onboarding/address.utils.js";
import { syncFolioDefaultsToFp } from "../../../utils/mf/onboarding/investmentAccountSync.utils.js";

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

/* ------------------------------------------------------------------ */
/*  POST /api/mf/address/overseas  (NRI only)                          */
/*  Creates an overseas address on FP and stores it in DB.             */
/*  On success also re-syncs folio_defaults if investment account       */
/*  already exists (so overseas_communication_address is linked).      */
/* ------------------------------------------------------------------ */
export const createOverseasAddress = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { line1, line2, city, postal_code, country } = req.body;

    if (!line1 || !postal_code || !country) {
      return res.status(400).json({
        success: false,
        message: "line1, postal_code and country are required",
      });
    }

    if (country === "IN") {
      return res.status(400).json({
        success: false,
        message: "Overseas address country must not be IN — use POST /api/mf/address for Indian address",
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

    if (mfData?.overseasAddress?.fpAddressId) {
      return res.status(409).json({
        success: false,
        message:     "Overseas address already linked to this profile",
        fpAddressId: mfData.overseasAddress.fpAddressId,
      });
    }

    const payload = {
      profile:     fpInvestorProfileId,
      line1:       line1.trim(),
      ...(line2 && { line2: line2.trim() }),
      ...(city   && { city: city.trim() }),
      country:     country.toUpperCase().trim(),
      postal_code: String(postal_code),
      nature:      "residential",
    };

    const fpData = await createFpAddress(payload);

    const addressObj = {
      fpAddressId: fpData.id,
      line1:       fpData.line1       ?? null,
      line2:       fpData.line2       ?? null,
      city:        fpData.city        ?? null,
      state:       fpData.state       ?? null,
      postalCode:  fpData.postal_code ?? null,
      country:     fpData.country     ?? country.toUpperCase(),
      nature:      fpData.nature      ?? "residential",
      rawResponse: fpData,
    };

    await MfUserData.findOneAndUpdate(
      { uniqueId },
      { $set: { overseasAddress: addressObj } },
      { upsert: true, new: true }
    );

    // Re-sync folio_defaults if investment account already exists
    let linkFailed = false;
    try {
      await syncFolioDefaultsToFp(uniqueId);
    } catch (syncErr) {
      console.warn("⚠️  [OVERSEAS ADDRESS] folio_defaults sync failed:", syncErr.message);
      linkFailed = true;
    }

    return res.status(201).json({
      success: true,
      message: "Overseas address linked to investor profile",
      ...(linkFailed && { warning: "Address saved but investment account sync failed — PATCH /api/mf/investment-account to retry" }),
      data: {
        fpAddressId:         fpData.id,
        fpInvestorProfileId,
        line1:      addressObj.line1,
        line2:      addressObj.line2,
        city:       addressObj.city,
        state:      addressObj.state,
        postalCode: addressObj.postalCode,
        country:    addressObj.country,
        nature:     addressObj.nature,
      },
    });
  } catch (err) {
    console.error("❌ [OVERSEAS ADDRESS] Create error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/address/overseas                                        */
/* ------------------------------------------------------------------ */
export const getOverseasAddress = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const mfData = await MfUserData.findOne({ uniqueId });

    if (!mfData?.overseasAddress?.fpAddressId) {
      return res.status(404).json({ success: false, message: "No overseas address found" });
    }

    const fpData = await fetchFpAddress(mfData.overseasAddress.fpAddressId);

    const addressObj = {
      fpAddressId: fpData.id,
      line1:       fpData.line1       ?? null,
      line2:       fpData.line2       ?? null,
      city:        fpData.city        ?? null,
      state:       fpData.state       ?? null,
      postalCode:  fpData.postal_code ?? null,
      country:     fpData.country     ?? null,
      nature:      fpData.nature      ?? "residential",
      rawResponse: fpData,
    };

    const record = await MfUserData.findOneAndUpdate(
      { uniqueId },
      { $set: { overseasAddress: addressObj } },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      data: {
        fpAddressId:         record.overseasAddress.fpAddressId,
        fpInvestorProfileId: mfData.investorProfile?.fpInvestorProfileId ?? null,
        line1:      record.overseasAddress.line1,
        line2:      record.overseasAddress.line2,
        city:       record.overseasAddress.city,
        state:      record.overseasAddress.state,
        postalCode: record.overseasAddress.postalCode,
        country:    record.overseasAddress.country,
        nature:     record.overseasAddress.nature,
      },
    });
  } catch (err) {
    console.error("❌ [OVERSEAS ADDRESS] Fetch error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
