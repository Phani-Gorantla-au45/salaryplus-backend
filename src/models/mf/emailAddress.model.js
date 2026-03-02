import mongoose from "mongoose";

const emailAddressSchema = new mongoose.Schema(
  {
    uniqueId:            { type: String, required: true, index: true },
    fpInvestorProfileId: { type: String, required: true, index: true },
    fpEmailAddressId:    { type: String, unique: true, sparse: true, index: true },
    email:               { type: String, trim: true, lowercase: true },
    belongsTo:           { type: String, default: null },
    rawResponse:         { type: mongoose.Schema.Types.Mixed, select: false },
  },
  { timestamps: true }
);

export default mongoose.model("EmailAddress", emailAddressSchema);
