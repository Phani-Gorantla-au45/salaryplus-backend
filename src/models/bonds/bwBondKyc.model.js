import mongoose from "mongoose";

const bwBondKycSchema = new mongoose.Schema(
  {
    userUniqueId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    panNumber: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },

    panFileUrl: {
      type: String,
      required: true,
    },

    // Masked Aadhaar / DL / Voter ID
    addressProofType: {
      type: String,
      enum: ["AADHAAR", "DL", "VOTER_ID"],
      required: true,
    },

    addressProofUrl: {
      type: String,
      required: true,
    },

    // Cancelled cheque / passbook / bank statement
    bankProofUrl: {
      type: String,
      required: true,
    },

    // Demat CMR / CML copy
    dematProofUrl: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: ["SUBMITTED", "APPROVED", "REJECTED"],
      default: "SUBMITTED",
    },

    kycRejectionReason: {
      type: String,
      trim: true,
      default: null,
    },

    submittedBy: {
      type: String,
      enum: ["USER", "ADMIN"],
      default: "USER",
    },
  },
  { timestamps: true },
);

export default mongoose.model("BwBondKyc", bwBondKycSchema);
