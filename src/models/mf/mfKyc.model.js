import mongoose from "mongoose";

const mfKycSchema = new mongoose.Schema(
  {
    uniqueId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    pan: { type: String, uppercase: true, trim: true },
    name: { type: String, trim: true },
    dob: { type: String, trim: true }, // YYYY-MM-DD

    // Overall result across all three checks
    overallStatus: {
      type: String,
      enum: ["VERIFIED", "PAN_FAILED", "NAME_MISMATCH", "DOB_MISMATCH", "PENDING", "UPSTREAM_ERROR", "ERROR"],
      default: "PENDING",
    },

    // PAN check result
    panStatus: { type: String, default: null },  // "verified" | "failed"
    panCode:   { type: String, default: null },  // "invalid" | "aadhaar_not_linked" | "upstream_error"

    // Name check result
    nameStatus: { type: String, default: null }, // "verified" | "failed"
    nameCode:   { type: String, default: null }, // "mismatch" | "upstream_error"

    // Date of birth check result
    dobStatus: { type: String, default: null },  // "verified" | "failed"
    dobCode:   { type: String, default: null },  // "mismatch" | "upstream_error"

    // KRA compliance result (from readiness field in Cybrilla response)
    // kraStatus: "verified" = KRA compliant (no fresh KYC needed)
    // kraStatus: "failed"   = NOT KRA compliant (fresh KYC submission required)
    kraStatus: { type: String, default: null },  // "verified" | "failed"
    kraCode:   { type: String, default: null },  // "unknown" | "kyc_unavailable" | "upstream_error" | etc.
    kraReason: { type: String, default: null },

    // Cybrilla pre-verification ID for audit/reference
    preVerificationId: { type: String },

    // Full Cybrilla response — excluded from default queries (use for debugging only)
    rawResponse: {
      type: mongoose.Schema.Types.Mixed,
      select: false,
    },

    lastCheckedAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model("MfKyc", mfKycSchema);
