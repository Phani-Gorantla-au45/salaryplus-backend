import mongoose from "mongoose";

const relatedPartySchema = new mongoose.Schema(
  {
    uniqueId:            { type: String, required: true, index: true },
    fpInvestorProfileId: { type: String, required: true, index: true },
    fpRelatedPartyId:    { type: String, unique: true, sparse: true, index: true },

    name:         { type: String, trim: true },
    relationship: { type: String, default: null },
    dob:          { type: String, default: null }, // YYYY-MM-DD
    pan:          { type: String, uppercase: true, trim: true, default: null },

    rawResponse: { type: mongoose.Schema.Types.Mixed, select: false },
  },
  { timestamps: true }
);

export default mongoose.model("RelatedParty", relatedPartySchema);
