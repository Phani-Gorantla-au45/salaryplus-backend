import MfUserData from "../../models/mf/mfUserData.model.js";
import {
  createFpInvestorProfile,
  updateFpInvestorProfile,
  fetchFpInvestorProfile,
} from "../../utils/mf/investorProfile.utils.js";

/* ------------------------------------------------------------------ */
/*  ENUMS                                                               */
/* ------------------------------------------------------------------ */
const ACCOUNT_ENUMS = {
  occupation: [
    { value: "business",               label: "Business" },
    { value: "professional",           label: "Professional" },
    { value: "retired",                label: "Retired" },
    { value: "house_wife",             label: "House Wife" },
    { value: "student",                label: "Student" },
    { value: "public_sector_service",  label: "Public Sector Service" },
    { value: "private_sector_service", label: "Private Sector Service" },
    { value: "government_service",     label: "Government Service" },
    { value: "agriculture",            label: "Agriculture" },
    { value: "doctor",                 label: "Doctor" },
    { value: "forex_dealer",           label: "Forex Dealer" },
    { value: "service",                label: "Service" },
    { value: "others",                 label: "Others" },
  ],
  source_of_wealth: [
    { value: "salary",             label: "Salary" },
    { value: "business",           label: "Business" },
    { value: "gift",               label: "Gift" },
    { value: "ancestral_property", label: "Ancestral Property" },
    { value: "rental_income",      label: "Rental Income" },
    { value: "prize_money",        label: "Prize Money" },
    { value: "royalty",            label: "Royalty" },
    { value: "others",             label: "Others" },
  ],
  income_slab: [
    { value: "upto_1lakh",               label: "Up to ₹1 Lakh" },
    { value: "above_1lakh_upto_5lakh",   label: "₹1 Lakh – ₹5 Lakh" },
    { value: "above_5lakh_upto_10lakh",  label: "₹5 Lakh – ₹10 Lakh" },
    { value: "above_10lakh_upto_25lakh", label: "₹10 Lakh – ₹25 Lakh" },
    { value: "above_25lakh_upto_1cr",    label: "₹25 Lakh – ₹1 Crore" },
    { value: "above_1cr",                label: "Above ₹1 Crore" },
  ],
  pep_details: [
    { value: "pep_exposed",    label: "Politically Exposed Person" },
    { value: "pep_related",    label: "Related to Politically Exposed Person" },
    { value: "not_applicable", label: "Not Applicable" },
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
/*  Helper — map FP response → investorProfile $set fields              */
/* ------------------------------------------------------------------ */
const profileFromFp = (fpData) => ({
  fpInvestorProfileId: fpData.id,
  type:             fpData.type,
  taxStatus:        fpData.tax_status,
  name:             fpData.name,
  dob:              fpData.date_of_birth,
  gender:           fpData.gender,
  occupation:       fpData.occupation,
  pan:              fpData.pan,
  countryOfBirth:   fpData.country_of_birth   ?? "IN",
  placeOfBirth:     fpData.place_of_birth     ?? "IN",
  firstTaxResidency: fpData.first_tax_residency ?? null,
  sourceOfWealth:   fpData.source_of_wealth,
  incomeSlab:       fpData.income_slab,
  pepDetails:       fpData.pep_details,
  signature:        fpData.signature ?? null,
  rawResponse:      fpData,
});

/* ------------------------------------------------------------------ */
/*  GET /api/mf/investor-profile/enums                                  */
/* ------------------------------------------------------------------ */
export const getAccountEnums = (req, res) => {
  return res.status(200).json({ success: true, data: ACCOUNT_ENUMS });
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/investor-profile                                       */
/* ------------------------------------------------------------------ */
export const createInvestorProfile = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const {
      name, dob, gender, occupation, pan, tax_status,
      source_of_wealth, income_slab, pep_details, signature,
    } = req.body;

    if (!name || !dob || !gender || !occupation || !pan || !tax_status ||
        !source_of_wealth || !income_slab || !pep_details) {
      return res.status(400).json({
        success: false,
        message: "name, dob, gender, occupation, pan, tax_status, source_of_wealth, income_slab, pep_details are required",
      });
    }

    /* ---------- PREVENT DUPLICATE ---------- */
    const mfData = await MfUserData.findOne({ uniqueId });
    if (mfData?.investorProfile?.fpInvestorProfileId) {
      return res.status(409).json({
        success: false,
        message:             "Investor profile already exists. Use PATCH to update.",
        fpInvestorProfileId: mfData.investorProfile.fpInvestorProfileId,
      });
    }

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
        country:      "IN",
        taxid_type:   "pan",
        taxid_number: pan.toUpperCase().trim(),
      },
      source_of_wealth,
      income_slab,
      pep_details,
      ...(signature    && { signature }),
      ...(ip_address   && { ip_address }),
    };

    const fpData = await createFpInvestorProfile(payload);

    const record = await MfUserData.findOneAndUpdate(
      { uniqueId },
      { $set: { investorProfile: profileFromFp(fpData) } },
      { upsert: true, new: true }
    );

    const ip = record.investorProfile;
    return res.status(201).json({
      success: true,
      message: "Investor profile created",
      data: {
        fpInvestorProfileId: ip.fpInvestorProfileId,
        name:           ip.name,
        pan:            ip.pan,
        taxStatus:      ip.taxStatus,
        gender:         ip.gender,
        occupation:     ip.occupation,
        sourceOfWealth: ip.sourceOfWealth,
        incomeSlab:     ip.incomeSlab,
        pepDetails:     ip.pepDetails,
      },
    });
  } catch (err) {
    console.error("❌ [INVESTOR PROFILE] Create error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  PATCH /api/mf/investor-profile                                      */
/* ------------------------------------------------------------------ */
export const updateInvestorProfile = async (req, res) => {
  try {
    const { uniqueId } = req.user;

    const mfData = await MfUserData.findOne({ uniqueId });
    if (!mfData?.investorProfile?.fpInvestorProfileId) {
      return res.status(404).json({
        success: false,
        message: "No investor profile found. Create one first.",
      });
    }

    const fpData = await updateFpInvestorProfile(mfData.investorProfile.fpInvestorProfileId, req.body);

    const record = await MfUserData.findOneAndUpdate(
      { uniqueId },
      { $set: { investorProfile: profileFromFp(fpData) } },
      { new: true }
    );

    const ip = record.investorProfile;
    return res.status(200).json({
      success: true,
      message: "Investor profile updated",
      data: {
        fpInvestorProfileId: ip.fpInvestorProfileId,
        name:           ip.name,
        occupation:     ip.occupation,
        sourceOfWealth: ip.sourceOfWealth,
        incomeSlab:     ip.incomeSlab,
        pepDetails:     ip.pepDetails,
      },
    });
  } catch (err) {
    console.error("❌ [INVESTOR PROFILE] Update error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/investor-profile                                        */
/*  Always returns 200:                                                 */
/*    created: true  — profile exists on FP, returns full data          */
/*    created: false — profile not created yet, returns prefill from    */
/*                     kycStatus (pan/name/dob available after KYC)     */
/* ------------------------------------------------------------------ */
export const getInvestorProfile = async (req, res) => {
  try {
    const { uniqueId } = req.user;

    const mfData = await MfUserData.findOne({ uniqueId });

    /* ---------- PROFILE NOT YET CREATED — return what we have ---------- */
    if (!mfData?.investorProfile?.fpInvestorProfileId) {
      const kyc = mfData?.kycStatus;
      return res.status(200).json({
        success: true,
        created: false,
        data: {
          fpInvestorProfileId: null,
          name: kyc?.name ?? null,
          pan:  kyc?.pan  ?? null,
          dob:  kyc?.dob  ?? null,
          // All other fields must be entered by the user
          gender:        null,
          occupation:    null,
          taxStatus:     null,
          sourceOfWealth: null,
          incomeSlab:    null,
          pepDetails:    null,
        },
      });
    }

    /* ---------- PROFILE EXISTS — sync from FP ---------- */
    const fpData = await fetchFpInvestorProfile(mfData.investorProfile.fpInvestorProfileId);

    const record = await MfUserData.findOneAndUpdate(
      { uniqueId },
      { $set: { investorProfile: profileFromFp(fpData) } },
      { new: true }
    );

    const ip = record.investorProfile;
    return res.status(200).json({
      success: true,
      created: true,
      data: {
        fpInvestorProfileId: ip.fpInvestorProfileId,
        type:              ip.type,
        taxStatus:         ip.taxStatus,
        name:              ip.name,
        dob:               ip.dob,
        gender:            ip.gender,
        occupation:        ip.occupation,
        pan:               ip.pan,
        countryOfBirth:    ip.countryOfBirth,
        placeOfBirth:      ip.placeOfBirth,
        firstTaxResidency: ip.firstTaxResidency,
        sourceOfWealth:    ip.sourceOfWealth,
        incomeSlab:        ip.incomeSlab,
        pepDetails:        ip.pepDetails,
        signature:         ip.signature,
      },
    });
  } catch (err) {
    console.error("❌ [INVESTOR PROFILE] Fetch error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
