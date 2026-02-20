import mongoose from "mongoose";

const SBregisterSchema = new mongoose.Schema(
  {
    uniqueId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    otpLastSentAt: {
      type: Date,
    },

    phone: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    fullName: {
      type: String,
      trim: true,
    },

    email: {
      type: String,
      lowercase: true,
      trim: true,
    },

    otp: String,
    otpExpiry: Date,

    panNumber: {
      type: String,
      uppercase: true,
      trim: true,
      index: true,
    },
    kycStatus: {
      type: String,
      enum: ["PENDING", "SUBMITTED", "APPROVED", "REJECTED"],
      default: "PENDING",
    },
    isNewUser: {
      type: Boolean,
      default: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

export default mongoose.model("SBregister", SBregisterSchema);
