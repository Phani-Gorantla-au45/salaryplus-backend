import MfUserData from "../../../models/mf/mfUserData.model.js";
import {
  createFpRelatedParty,
  fetchFpRelatedParty,
} from "../../../utils/mf/onboarding/relatedParty.utils.js";

const RELATIONSHIP_VALUES = [
  "father", "mother", "court_appointed_legal_guardian", "aunt",
  "brother_in_law", "brother", "daughter", "daughter_in_law",
  "father_in_law", "grand_daughter", "grand_father", "grand_mother",
  "grand_son", "mother_in_law", "nephew", "niece", "sister",
  "sister_in_law", "son", "son_in_law", "spouse", "uncle", "others",
];

const RELATIONSHIP_LABELS = {
  father: "Father", mother: "Mother",
  court_appointed_legal_guardian: "Court Appointed Legal Guardian",
  aunt: "Aunt", brother_in_law: "Brother In Law", brother: "Brother",
  daughter: "Daughter", daughter_in_law: "Daughter In Law",
  father_in_law: "Father In Law", grand_daughter: "Grand Daughter",
  grand_father: "Grand Father", grand_mother: "Grand Mother",
  grand_son: "Grand Son", mother_in_law: "Mother In Law",
  nephew: "Nephew", niece: "Niece", sister: "Sister",
  sister_in_law: "Sister In Law", son: "Son", son_in_law: "Son In Law",
  spouse: "Spouse", uncle: "Uncle", others: "Others",
};

/* ------------------------------------------------------------------ */
/*  Helper — is nominee a minor (age < 18)?                             */
/* ------------------------------------------------------------------ */
const checkIsMinor = (dob) => {
  if (!dob) return false;
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age < 18;
};

/* ------------------------------------------------------------------ */
/*  Helper — derive identity proof type from pan/aadhaar                */
/* ------------------------------------------------------------------ */
const identityProofType = (pan, aadhaar) =>
  pan ? "pan" : aadhaar ? "aadhaar" : null;

/* ------------------------------------------------------------------ */
/*  Helper — build FP payload from request body                         */
/* ------------------------------------------------------------------ */
const buildFpPayload = (body) => {
  const {
    name, relationship, date_of_birth,
    pan, aadhaar_number,
    email_address, phone_number,
    line1, line2, city, pincode, state, country,
    // guardian fields (only for minors)
    guardian_name, guardian_pan, guardian_aadhaar_number,
    guardian_email_address, guardian_phone_number,
    guardian_line1, guardian_line2, guardian_city,
    guardian_pincode, guardian_state, guardian_country,
  } = body;

  const payload = {};
  if (name)           payload.name           = name.trim();
  if (relationship)   payload.relationship   = relationship;
  if (date_of_birth)  payload.date_of_birth  = new Date(date_of_birth).toISOString().split("T")[0]; // FP expects YYYY-MM-DD
  if (pan)            payload.pan            = pan.toUpperCase().trim();
  if (aadhaar_number) payload.aadhaar_number = parseInt(aadhaar_number, 10); // FP expects integer
  if (email_address)  payload.email_address  = email_address.trim();
  if (phone_number)   payload.phone_number   = { isd: "+91", number: String(phone_number).trim() };

  if (line1 || city || pincode) {
    payload.address = {
      line1:       line1   ?? null,
      line2:       line2   ?? null,
      city:        city    ?? null,
      postal_code: pincode ?? null,   // FP uses postal_code
      state:       state   ?? null,
      country:     country ?? "IN",
    };
  }

  // Guardian fields — only sent to FP when nominee is a minor
  if (guardian_name)             payload.guardian_name             = guardian_name.trim();
  if (guardian_pan)              payload.guardian_pan              = guardian_pan.toUpperCase().trim();
  if (guardian_aadhaar_number)   payload.guardian_aadhaar_number   = parseInt(guardian_aadhaar_number, 10); // FP expects integer
  if (guardian_email_address)    payload.guardian_email_address    = guardian_email_address.trim();
  if (guardian_phone_number)     payload.guardian_phone_number     = { isd: "+91", number: String(guardian_phone_number).trim() };

  if (guardian_line1 || guardian_city || guardian_pincode) {
    payload.guardian_address = {
      line1:       guardian_line1   ?? null,
      line2:       guardian_line2   ?? null,
      city:        guardian_city    ?? null,
      postal_code: guardian_pincode ?? null,  // FP uses postal_code
      state:       guardian_state   ?? null,
      country:     guardian_country ?? "IN",
    };
  }

  return payload;
};

/* ------------------------------------------------------------------ */
/*  Helper — map FP response to nominee $set fields                     */
/* ------------------------------------------------------------------ */
const nomineeFromFp = (fpData) => {
  const ad  = fpData.address          ?? {};
  const gad = fpData.guardian_address ?? {};
  const minor = checkIsMinor(fpData.date_of_birth);

  return {
    fpRelatedPartyId:  fpData.id,
    name:              fpData.name,
    relationship:      fpData.relationship,
    dob:               fpData.date_of_birth    ?? null,
    isMinor:           minor,
    pan:               fpData.pan              ?? null,
    aadhaarNumber:     fpData.aadhaar_number   ?? null,
    identityProofType: identityProofType(fpData.pan, fpData.aadhaar_number),
    emailAddress:      fpData.email_address              ?? null,
    phoneNumber:       fpData.phone_number?.number       ?? null,
    address: {
      line1:   ad.line1       ?? null,
      line2:   ad.line2       ?? null,
      city:    ad.city        ?? null,
      pincode: ad.postal_code ?? null,  // FP returns postal_code
      state:   ad.state       ?? null,
      country: ad.country     ?? "IN",
    },
    // Guardian (populated only if minor)
    guardianName:              fpData.guardian_name              ?? null,
    guardianPan:               fpData.guardian_pan               ?? null,
    guardianAadhaarNumber:     fpData.guardian_aadhaar_number    ?? null,
    guardianIdentityProofType: identityProofType(fpData.guardian_pan, fpData.guardian_aadhaar_number),
    guardianEmailAddress:      fpData.guardian_email_address              ?? null,
    guardianPhoneNumber:       fpData.guardian_phone_number?.number       ?? null,
    guardianAddress: {
      line1:   gad.line1       ?? null,
      line2:   gad.line2       ?? null,
      city:    gad.city        ?? null,
      pincode: gad.postal_code ?? null,  // FP returns postal_code
      state:   gad.state       ?? null,
      country: gad.country     ?? "IN",
    },
    rawResponse: fpData,
  };
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/related-party/enums                                     */
/* ------------------------------------------------------------------ */
export const getRelatedPartyEnums = (req, res) => {
  return res.status(200).json({
    success: true,
    data: {
      relationship: RELATIONSHIP_VALUES.map((value) => ({
        value,
        label: RELATIONSHIP_LABELS[value],
      })),
    },
  });
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/related-party                                          */
/* ------------------------------------------------------------------ */
export const createRelatedParty = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const {
      name, relationship, date_of_birth,
      pan, aadhaar_number,
      email_address, phone_number, line1, city, pincode,
      guardian_name, guardian_pan, guardian_aadhaar_number,
      guardian_email_address, guardian_phone_number,
      guardian_line1, guardian_city, guardian_pincode,
    } = req.body;

    if (!name || !relationship) {
      return res.status(400).json({ success: false, message: "name and relationship are required" });
    }
    if (!RELATIONSHIP_VALUES.includes(relationship)) {
      return res.status(400).json({
        success: false,
        message: `relationship must be one of: ${RELATIONSHIP_VALUES.join(", ")}`,
      });
    }
    if (!pan && !aadhaar_number) {
      return res.status(400).json({ success: false, message: "pan or aadhaar_number is required" });
    }
    if (!email_address || !phone_number) {
      return res.status(400).json({ success: false, message: "email_address and phone_number are required" });
    }
    if (!line1 || !city || !pincode) {
      return res.status(400).json({ success: false, message: "address fields line1, city and pincode are required" });
    }

    /* ---------- MINOR CHECK — guardian required if nominee < 18 ---------- */
    const minor = date_of_birth ? checkIsMinor(date_of_birth) : false;
    if (minor) {
      if (!guardian_name) {
        return res.status(400).json({ success: false, message: "guardian_name is required for a minor nominee" });
      }
      if (!guardian_pan && !guardian_aadhaar_number) {
        return res.status(400).json({ success: false, message: "guardian_pan or guardian_aadhaar_number is required for a minor nominee" });
      }
      if (!guardian_email_address || !guardian_phone_number) {
        return res.status(400).json({ success: false, message: "guardian_email_address and guardian_phone_number are required for a minor nominee" });
      }
      if (!guardian_line1 || !guardian_city || !guardian_pincode) {
        return res.status(400).json({ success: false, message: "guardian address fields (guardian_line1, guardian_city, guardian_pincode) are required for a minor nominee" });
      }
    }

    const mfData = await MfUserData.findOne({ uniqueId });

    const fpInvestorProfileId = mfData?.investorProfile?.fpInvestorProfileId;
    if (!fpInvestorProfileId) {
      return res.status(400).json({
        success: false,
        message: "Investor profile not found. Create one first.",
      });
    }

    const payload = {
      profile: fpInvestorProfileId,
      ...buildFpPayload(req.body),
    };

    const fpData = await createFpRelatedParty(payload);

    const record = await MfUserData.findOneAndUpdate(
      { uniqueId },
      { $set: { nominee: nomineeFromFp(fpData) } },
      { upsert: true, new: true }
    );

    return res.status(201).json({
      success: true,
      message: "Nominee added successfully",
      data: formatNominee(record.nominee),
    });
  } catch (err) {
    console.error("❌ [RELATED PARTY] Create error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  PATCH /api/mf/related-party/:fpRelatedPartyId                       */
/*  FP does not support PATCH — creates a new party with merged data.  */
/*  Call PATCH /api/mf/investment-account afterward to re-link.        */
/* ------------------------------------------------------------------ */
export const updateRelatedParty = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { fpRelatedPartyId } = req.params;

    const mfData   = await MfUserData.findOne({ uniqueId });
    const existing = mfData?.nominee;

    if (!existing?.fpRelatedPartyId || existing.fpRelatedPartyId !== fpRelatedPartyId) {
      return res.status(404).json({ success: false, message: "Related party not found" });
    }

    /* Merge existing DB data + new body */
    const merged = {
      name:           req.body.name           ?? existing.name,
      relationship:   req.body.relationship   ?? existing.relationship,
      date_of_birth:  req.body.date_of_birth  ?? existing.dob,
      pan:            req.body.pan            ?? existing.pan,
      aadhaar_number: req.body.aadhaar_number ?? existing.aadhaarNumber,
      email_address:  req.body.email_address  ?? existing.emailAddress,
      phone_number:   req.body.phone_number   ?? existing.phoneNumber,
      line1:   req.body.line1   ?? existing.address?.line1,
      line2:   req.body.line2   ?? existing.address?.line2,
      city:    req.body.city    ?? existing.address?.city,
      pincode: req.body.pincode ?? existing.address?.pincode,
      state:   req.body.state   ?? existing.address?.state,
      country: req.body.country ?? existing.address?.country,
    };

    const fpInvestorProfileId = mfData?.investorProfile?.fpInvestorProfileId;
    if (!fpInvestorProfileId) {
      return res.status(400).json({ success: false, message: "Investor profile not found" });
    }

    const payload = {
      profile: fpInvestorProfileId,
      ...buildFpPayload(merged),
    };

    const fpData = await createFpRelatedParty(payload);

    const record = await MfUserData.findOneAndUpdate(
      { uniqueId },
      { $set: { nominee: nomineeFromFp(fpData) } },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      message: "Nominee re-created with updated data. Call PATCH /api/mf/investment-account to re-link.",
      data: formatNominee(record.nominee),
    });
  } catch (err) {
    console.error("❌ [RELATED PARTY] Update error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/related-party                                           */
/* ------------------------------------------------------------------ */
export const listRelatedParties = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const mfData  = await MfUserData.findOne({ uniqueId });
    const nominee = mfData?.nominee;

    return res.status(200).json({
      success: true,
      data: nominee?.fpRelatedPartyId ? [formatNominee(nominee)] : [],
    });
  } catch (err) {
    console.error("❌ [RELATED PARTY] List error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/related-party/:fpRelatedPartyId                         */
/* ------------------------------------------------------------------ */
export const getRelatedParty = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { fpRelatedPartyId } = req.params;

    const mfData = await MfUserData.findOne({ uniqueId });
    if (mfData?.nominee?.fpRelatedPartyId !== fpRelatedPartyId) {
      return res.status(404).json({ success: false, message: "Related party not found" });
    }

    const fpData = await fetchFpRelatedParty(fpRelatedPartyId);

    const record = await MfUserData.findOneAndUpdate(
      { uniqueId },
      { $set: { nominee: nomineeFromFp(fpData) } },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      data: formatNominee(record.nominee),
    });
  } catch (err) {
    console.error("❌ [RELATED PARTY] Fetch error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  Internal formatter                                                   */
/* ------------------------------------------------------------------ */
const formatNominee = (n) => ({
  fpRelatedPartyId:  n?.fpRelatedPartyId,
  name:              n?.name,
  relationship:      n?.relationship,
  dob:               n?.dob,
  isMinor:           n?.isMinor ?? false,
  pan:               n?.pan,
  aadhaarNumber:     n?.aadhaarNumber,
  identityProofType: n?.identityProofType ?? null,
  emailAddress:      n?.emailAddress,
  phoneNumber:       n?.phoneNumber,
  address:           n?.address,
  // Guardian — only shown when nominee is a minor
  ...(n?.isMinor && {
    guardian: {
      name:              n?.guardianName,
      pan:               n?.guardianPan,
      aadhaarNumber:     n?.guardianAadhaarNumber,
      identityProofType: n?.guardianIdentityProofType ?? null,
      emailAddress:      n?.guardianEmailAddress,
      phoneNumber:       n?.guardianPhoneNumber,
      address:           n?.guardianAddress,
    },
  }),
});
