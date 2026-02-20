import mongoose from "mongoose";

const kycSchema = new mongoose.Schema(
  {
    userUniqueId: {
      type: String,
      required: true,
      index: true,
    },

    panNumber: {
      type: String,
      required: true,
      uppercase: true,
    },
    kycRejectionReason: {
      type: String,
      trim: true,
    },

    panFileUrl: {
      type: String,
      required: true,
    },

    addressProofUrl: {
      type: String,
      required: true,
    },

    dematProofUrl: {
      type: String,
      required: true,
    },

    bankProofUrl: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: ["SUBMITTED", "APPROVED", "REJECTED"],
      default: "SUBMITTED",
    },
  },
  { timestamps: true },
);

export default mongoose.model("KYC", kycSchema);
