import mongoose from "mongoose";

const kycRequestSchema = new mongoose.Schema(
  {
    // Our user reference
    uniqueId: {
      type: String,
      required: true,
      index: true,
    },

    // FintechPrimitives KYC Request ID (kycr_...)
    fpKycRequestId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Mirrors FP status: pending | esign_required | submitted | successful | rejected | expired
    status: {
      type: String,
      enum: ["pending", "esign_required", "submitted", "successful", "rejected", "expired"],
      default: "pending",
    },

    // Basic investor info
    pan:   { type: String, uppercase: true, trim: true },
    name:  { type: String, trim: true },
    email: { type: String, trim: true },
    dob:   { type: String, trim: true }, // YYYY-MM-DD

    // Pending fields — dynamically returned by FP (requirements.fields_needed)
    fieldsNeeded: {
      type: [String],
      default: [],
    },

    // Verification outcome
    verificationStatus: { type: String, default: null },
    verificationDetails: { type: mongoose.Schema.Types.Mixed, default: null },

    // Timestamps from FP
    fpExpiresAt:    { type: Date, default: null },
    fpSubmittedAt:  { type: Date, default: null },
    fpSuccessfulAt: { type: Date, default: null },
    fpRejectedAt:   { type: Date, default: null },

    // Full FP response stored for audit (excluded from default queries)
    rawResponse: {
      type: mongoose.Schema.Types.Mixed,
      select: false,
    },
  },
  { timestamps: true }
);

export default mongoose.model("KycRequest", kycRequestSchema);
