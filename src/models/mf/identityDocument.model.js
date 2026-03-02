import mongoose from "mongoose";

const identityDocumentSchema = new mongoose.Schema(
  {
    uniqueId:       { type: String, required: true, index: true },
    fpKycRequestId: { type: String, required: true, index: true },

    // FP identity document ID (iddoc_...)
    fpIdDocId: { type: String, required: true, unique: true, index: true },

    type: { type: String, default: "aadhaar" },

    // fetch sub-doc
    fetchStatus:    { type: String, default: "pending" }, // pending | successful | failed | expired
    fetchReason:    { type: String, default: null },
    redirectUrl:    { type: String, default: null },
    postbackUrl:    { type: String, default: null },
    fetchExpiresAt: { type: Date,   default: null },

    // Aadhaar data (populated after successful fetch)
    aadhaarLastFour: { type: String, default: null },
    addressLine1:    { type: String, default: null },
    city:            { type: String, default: null },
    pincode:         { type: String, default: null },
    country:         { type: String, default: null },

    rawResponse: { type: mongoose.Schema.Types.Mixed, select: false },
  },
  { timestamps: true }
);

export default mongoose.model("IdentityDocument", identityDocumentSchema);
