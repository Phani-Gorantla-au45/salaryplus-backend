import mongoose from "mongoose";

const taxResidencySchema = new mongoose.Schema(
  {
    country:       { type: String, default: null },
    taxid_type:    { type: String, default: null },
    taxid_number:  { type: String, default: null },
  },
  { _id: false }
);

const investorProfileSchema = new mongoose.Schema(
  {
    // Our user reference
    uniqueId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // FintechPrimitives ID (invp_...)
    fpInvestorProfileId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },

    // Core fields
    type:      { type: String, default: "individual" },
    taxStatus: { type: String, default: null }, // resident_individual | nri
    name:      { type: String, trim: true },
    dob:       { type: String, default: null }, // YYYY-MM-DD
    gender:    { type: String, default: null }, // male | female | transgender
    occupation: { type: String, default: null },
    pan:       { type: String, uppercase: true, trim: true },

    // Birth info (always "IN" for now)
    countryOfBirth: { type: String, default: "IN" },
    placeOfBirth:   { type: String, default: "IN" },

    // Tax residency
    firstTaxResidency: { type: taxResidencySchema, default: null },

    // Financial profile
    sourceOfWealth: { type: String, default: null },
    incomeSlab:     { type: String, default: null },
    pepDetails:     { type: String, default: null },

    // Signature file ID (from /api/mf/file/upload)
    signature: { type: String, default: null },

    // Full FP response for audit
    rawResponse: {
      type: mongoose.Schema.Types.Mixed,
      select: false,
    },
  },
  { timestamps: true }
);

export default mongoose.model("InvestorProfile", investorProfileSchema);
