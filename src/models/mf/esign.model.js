import mongoose from "mongoose";

const esignSchema = new mongoose.Schema(
  {
    uniqueId:       { type: String, required: true, index: true },
    fpKycRequestId: { type: String, required: true, index: true },

    // FP esign ID
    fpEsignId: { type: String, required: true, unique: true, index: true },

    type:        { type: String, default: "aadhaar" },
    status:      { type: String, default: "pending" }, // pending | successful
    redirectUrl: { type: String, default: null },
    postbackUrl: { type: String, default: null },

    rawResponse: { type: mongoose.Schema.Types.Mixed, select: false },
  },
  { timestamps: true }
);

export default mongoose.model("Esign", esignSchema);
