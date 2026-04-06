import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

const registrationSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: true,
      unique: true,
      match: /^[0-9]{10}$/,
    },

    // 🔥 FIX HERE
    uniqueId: {
      type:    String,
      unique:  true,
      sparse:  true,
      default: undefined, // omit field entirely until set — prevents null dup key error
    },

    First_name: { type: String, trim: true },
    Last_name: { type: String, trim: true },

    email: {
      type: String,
      lowercase: true,
      trim: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    panVerified: { type: Boolean, default: false },

    stateId: String,
    otp: String,
    otpExpiry: Date,
    isVerified: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export default mongoose.model("RegistrationUser", registrationSchema);
