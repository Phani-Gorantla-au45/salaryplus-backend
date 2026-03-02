import RelatedParty from "../../models/mf/relatedParty.model.js";
import InvestorProfile from "../../models/mf/investorProfile.model.js";
import {
  createFpRelatedParty,
  fetchFpRelatedParty,
} from "../../utils/mf/relatedParty.utils.js";

const RELATIONSHIP_VALUES = [
  "father", "mother", "court_appointed_legal_guardian", "aunt",
  "brother_in_law", "brother", "daughter", "daughter_in_law",
  "father_in_law", "grand_daughter", "grand_father", "grand_mother",
  "grand_son", "mother_in_law", "nephew", "niece", "sister",
  "sister_in_law", "son", "son_in_law", "spouse", "uncle", "others",
];

const RELATIONSHIP_LABELS = {
  father:                         "Father",
  mother:                         "Mother",
  court_appointed_legal_guardian: "Court Appointed Legal Guardian",
  aunt:                           "Aunt",
  brother_in_law:                 "Brother In Law",
  brother:                        "Brother",
  daughter:                       "Daughter",
  daughter_in_law:                "Daughter In Law",
  father_in_law:                  "Father In Law",
  grand_daughter:                 "Grand Daughter",
  grand_father:                   "Grand Father",
  grand_mother:                   "Grand Mother",
  grand_son:                      "Grand Son",
  mother_in_law:                  "Mother In Law",
  nephew:                         "Nephew",
  niece:                          "Niece",
  sister:                         "Sister",
  sister_in_law:                  "Sister In Law",
  son:                            "Son",
  son_in_law:                     "Son In Law",
  spouse:                         "Spouse",
  uncle:                          "Uncle",
  others:                         "Others",
};

const syncToDb = async (uniqueId, fpData) => {
  return RelatedParty.findOneAndUpdate(
    { fpRelatedPartyId: fpData.id },
    {
      $set: {
        uniqueId,
        fpInvestorProfileId: fpData.profile,
        fpRelatedPartyId:    fpData.id,
        name:         fpData.name,
        relationship: fpData.relationship,
        dob:          fpData.date_of_birth ?? null,
        pan:          fpData.pan           ?? null,
        rawResponse:  fpData,
      },
    },
    { upsert: true, new: true }
  );
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/related-party/enums                                     */
/*  Returns relationship dropdown values (no auth)                      */
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
/*  Add a nominee/related party to the investor profile                 */
/* ------------------------------------------------------------------ */
export const createRelatedParty = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { name, relationship, date_of_birth, pan } = req.body;

    if (!name || !relationship) {
      return res.status(400).json({
        success: false,
        message: "name and relationship are required",
      });
    }

    if (!RELATIONSHIP_VALUES.includes(relationship)) {
      return res.status(400).json({
        success: false,
        message: `relationship must be one of: ${RELATIONSHIP_VALUES.join(", ")}`,
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

    /* ---------- CALL FP API ---------- */
    const payload = {
      profile:      profile.fpInvestorProfileId,
      name:         name.trim(),
      relationship,
      ...(date_of_birth && { date_of_birth }),
      ...(pan           && { pan: pan.toUpperCase().trim() }),
    };

    const fpData = await createFpRelatedParty(payload);
    const record = await syncToDb(uniqueId, fpData);

    return res.status(201).json({
      success: true,
      message: "Related party (nominee) added to investor profile",
      data: {
        fpRelatedPartyId:    record.fpRelatedPartyId,
        fpInvestorProfileId: record.fpInvestorProfileId,
        name:         record.name,
        relationship: record.relationship,
        dob:          record.dob,
        pan:          record.pan,
      },
    });
  } catch (err) {
    console.error("❌ [RELATED PARTY] Create error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/related-party                                           */
/*  List all nominees for the logged-in user                            */
/* ------------------------------------------------------------------ */
export const listRelatedParties = async (req, res) => {
  try {
    const { uniqueId } = req.user;

    const records = await RelatedParty.find({ uniqueId }).sort({ createdAt: 1 });

    return res.status(200).json({
      success: true,
      data: records.map((r) => ({
        fpRelatedPartyId:    r.fpRelatedPartyId,
        fpInvestorProfileId: r.fpInvestorProfileId,
        name:         r.name,
        relationship: r.relationship,
        dob:          r.dob,
        pan:          r.pan,
      })),
    });
  } catch (err) {
    console.error("❌ [RELATED PARTY] List error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/related-party/:fpRelatedPartyId                         */
/*  Fetch a specific related party (refresh from FP)                    */
/* ------------------------------------------------------------------ */
export const getRelatedParty = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { fpRelatedPartyId } = req.params;

    const existing = await RelatedParty.findOne({ fpRelatedPartyId, uniqueId });
    if (!existing) {
      return res.status(404).json({ success: false, message: "Related party not found" });
    }

    const fpData = await fetchFpRelatedParty(fpRelatedPartyId);
    const record = await syncToDb(uniqueId, fpData);

    return res.status(200).json({
      success: true,
      data: {
        fpRelatedPartyId:    record.fpRelatedPartyId,
        fpInvestorProfileId: record.fpInvestorProfileId,
        name:         record.name,
        relationship: record.relationship,
        dob:          record.dob,
        pan:          record.pan,
      },
    });
  } catch (err) {
    console.error("❌ [RELATED PARTY] Fetch error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
