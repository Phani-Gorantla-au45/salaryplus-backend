import mongoose from "mongoose";

const SBregisterSchema = new mongoose.Schema(
  {
    uniqueId: {
      type: String,
      unique: true,
      index: true,
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

    kycStatus: {
      type: String,
      enum: ["PENDING", "SUBMITTED", "COMPLETED", "REJECTED"],
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
