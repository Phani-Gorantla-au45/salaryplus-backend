// models/admin/admin.model.js
import mongoose from "mongoose";

const adminSchema = new mongoose.Schema(
  {
    uniqueId: {
      type: String,
      unique: true,
      sparse: true,
    },
    phone: {
      type: String,
      unique: true,
      required: true,
    },
    otp: String,
    otpExpiry: Date,
    isVerified: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

export default mongoose.model("Admin", adminSchema);
