import InvestorProfile from "../../models/mf/investorProfile.model.js";
import {
  createFpInvestorProfile,
  updateFpInvestorProfile,
  fetchFpInvestorProfile,
} from "../../utils/mf/investorProfile.utils.js";

/* ------------------------------------------------------------------ */
/*  ENUMS — static reference data for frontend dropdowns               */
/* ------------------------------------------------------------------ */
const ACCOUNT_ENUMS = {
  occupation: [
    { value: "business",              label: "Business" },
    { value: "professional",          label: "Professional" },
    { value: "retired",               label: "Retired" },
    { value: "house_wife",            label: "House Wife" },
    { value: "student",               label: "Student" },
    { value: "public_sector_service", label: "Public Sector Service" },
    { value: "private_sector_service",label: "Private Sector Service" },
    { value: "government_service",    label: "Government Service" },
    { value: "agriculture",           label: "Agriculture" },
    { value: "doctor",                label: "Doctor" },
    { value: "forex_dealer",          label: "Forex Dealer" },
    { value: "service",               label: "Service" },
    { value: "others",                label: "Others" },
  ],
  source_of_wealth: [
    { value: "salary",              label: "Salary" },
    { value: "business",            label: "Business" },
    { value: "gift",                label: "Gift" },
    { value: "ancestral_property",  label: "Ancestral Property" },
    { value: "rental_income",       label: "Rental Income" },
    { value: "prize_money",         label: "Prize Money" },
    { value: "royalty",             label: "Royalty" },
    { value: "others",              label: "Others" },
  ],
  income_slab: [
    { value: "upto_1lakh",                 label: "Up to ₹1 Lakh" },
    { value: "above_1lakh_upto_5lakh",     label: "₹1 Lakh – ₹5 Lakh" },
    { value: "above_5lakh_upto_10lakh",    label: "₹5 Lakh – ₹10 Lakh" },
    { value: "above_10lakh_upto_25lakh",   label: "₹10 Lakh – ₹25 Lakh" },
    { value: "above_25lakh_upto_1cr",      label: "₹25 Lakh – ₹1 Crore" },
    { value: "above_1cr",                  label: "Above ₹1 Crore" },
  ],
  pep_details: [
    { value: "pep_exposed",   label: "Politically Exposed Person" },
    { value: "pep_related",   label: "Related to Politically Exposed Person" },
    { value: "not_applicable",label: "Not Applicable" },
  ],
  gender: [
    { value: "male",        label: "Male" },
    { value: "female",      label: "Female" },
    { value: "transgender", label: "Transgender" },
  ],
  tax_status: [
    { value: "resident_individual", label: "Resident Individual" },
    { value: "nri",                 label: "NRI" },
  ],
};

/* ------------------------------------------------------------------ */
/*  Helper — sync FP response → DB                                      */
/* ------------------------------------------------------------------ */
const syncToDb = async (uniqueId, fpData) => {
  return InvestorProfile.findOneAndUpdate(
    { uniqueId },
    {
      $set: {
        uniqueId,
        fpInvestorProfileId: fpData.id,
        type:           fpData.type,
        taxStatus:      fpData.tax_status,
        name:           fpData.name,
        dob:            fpData.date_of_birth,
        gender:         fpData.gender,
        occupation:     fpData.occupation,
        pan:            fpData.pan,
        countryOfBirth: fpData.country_of_birth ?? "IN",
        placeOfBirth:   fpData.place_of_birth   ?? "IN",
        firstTaxResidency: fpData.first_tax_residency ?? null,
        sourceOfWealth: fpData.source_of_wealth,
        incomeSlab:     fpData.income_slab,
        pepDetails:     fpData.pep_details,
        signature:      fpData.signature ?? null,
        rawResponse:    fpData,
      },
    },
    { upsert: true, new: true }
  );
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/investor-profile/enums                                  */
/*  No auth — returns all dropdown values for the account creation form */
/* ------------------------------------------------------------------ */
export const getAccountEnums = (req, res) => {
  return res.status(200).json({ success: true, data: ACCOUNT_ENUMS });
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/investor-profile                                       */
/*  Create investor profile                                             */
/* ------------------------------------------------------------------ */
export const createInvestorProfile = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const {
      name, dob, gender, occupation, pan, tax_status,
      source_of_wealth, income_slab, pep_details, signature,
    } = req.body;

    /* ---------- REQUIRED FIELDS ---------- */
    if (!name || !dob || !gender || !occupation || !pan || !tax_status ||
        !source_of_wealth || !income_slab || !pep_details) {
      return res.status(400).json({
        success: false,
        message: "name, dob, gender, occupation, pan, tax_status, source_of_wealth, income_slab, pep_details are required",
      });
    }

    /* ---------- PREVENT DUPLICATE ---------- */
    const existing = await InvestorProfile.findOne({ uniqueId });
    if (existing?.fpInvestorProfileId) {
      return res.status(409).json({
        success: false,
        message: "Investor profile already exists. Use PATCH to update.",
        fpInvestorProfileId: existing.fpInvestorProfileId,
      });
    }

    /* ---------- BUILD FP PAYLOAD ---------- */
    // Get request IP for audit
    const ip_address = req.headers["x-forwarded-for"]?.split(",")[0]?.trim()
      || req.socket?.remoteAddress
      || null;

    const payload = {
      type:                       "individual",
      tax_status,
      name:                       name.trim(),
      date_of_birth:              dob,
      gender,
      occupation,
      pan:                        pan.toUpperCase().trim(),
      country_of_birth:           "IN",
      place_of_birth:             "IN",
      use_default_tax_residences: false,
      first_tax_residency: {
        country:       "IN",
        taxid_type:    "pan",
        taxid_number:  pan.toUpperCase().trim(),
      },
      source_of_wealth,
      income_slab,
      pep_details,
      ...(signature && { signature }),
      ...(ip_address && { ip_address }),
    };

    /* ---------- CALL FP API ---------- */
    const fpData = await createFpInvestorProfile(payload);

    /* ---------- PERSIST ---------- */
    const record = await syncToDb(uniqueId, fpData);

    return res.status(201).json({
      success: true,
      message: "Investor profile created",
      data: {
        fpInvestorProfileId: record.fpInvestorProfileId,
        name:           record.name,
        pan:            record.pan,
        taxStatus:      record.taxStatus,
        gender:         record.gender,
        occupation:     record.occupation,
        sourceOfWealth: record.sourceOfWealth,
        incomeSlab:     record.incomeSlab,
        pepDetails:     record.pepDetails,
      },
    });
  } catch (err) {
    console.error("❌ [INVESTOR PROFILE] Create error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  PATCH /api/mf/investor-profile                                      */
/*  Update investor profile (FP id from DB — no need to pass in body)  */
/* ------------------------------------------------------------------ */
export const updateInvestorProfile = async (req, res) => {
  try {
    const { uniqueId } = req.user;

    const existing = await InvestorProfile.findOne({ uniqueId });
    if (!existing?.fpInvestorProfileId) {
      return res.status(404).json({
        success: false,
        message: "No investor profile found. Create one first.",
      });
    }

    /* ---------- CALL FP API ---------- */
    const fpData = await updateFpInvestorProfile(existing.fpInvestorProfileId, req.body);

    /* ---------- SYNC DB ---------- */
    const record = await syncToDb(uniqueId, fpData);

    return res.status(200).json({
      success: true,
      message: "Investor profile updated",
      data: {
        fpInvestorProfileId: record.fpInvestorProfileId,
        name:           record.name,
        occupation:     record.occupation,
        sourceOfWealth: record.sourceOfWealth,
        incomeSlab:     record.incomeSlab,
        pepDetails:     record.pepDetails,
      },
    });
  } catch (err) {
    console.error("❌ [INVESTOR PROFILE] Update error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/investor-profile                                        */
/*  Fetch stored profile (refresh from FP if exists)                    */
/* ------------------------------------------------------------------ */
export const getInvestorProfile = async (req, res) => {
  try {
    const { uniqueId } = req.user;

    const existing = await InvestorProfile.findOne({ uniqueId });
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "No investor profile found",
      });
    }

    /* Refresh from FP to get latest state */
    const fpData = await fetchFpInvestorProfile(existing.fpInvestorProfileId);
    const record = await syncToDb(uniqueId, fpData);

    return res.status(200).json({
      success: true,
      data: {
        fpInvestorProfileId: record.fpInvestorProfileId,
        type:              record.type,
        taxStatus:         record.taxStatus,
        name:              record.name,
        dob:               record.dob,
        gender:            record.gender,
        occupation:        record.occupation,
        pan:               record.pan,
        countryOfBirth:    record.countryOfBirth,
        placeOfBirth:      record.placeOfBirth,
        firstTaxResidency: record.firstTaxResidency,
        sourceOfWealth:    record.sourceOfWealth,
        incomeSlab:        record.incomeSlab,
        pepDetails:        record.pepDetails,
        signature:         record.signature,
      },
    });
  } catch (err) {
    console.error("❌ [INVESTOR PROFILE] Fetch error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
