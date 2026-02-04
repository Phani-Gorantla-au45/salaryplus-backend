// models/kyc.model.js
import mongoose from "mongoose";

const kycSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    uniqueId: {
      type: String,
      required: true,
      index: true,
    },

    // 🔹 PAN DETAILS
    panNumber: {
      type: String,
      uppercase: true,
      trim: true,
    },

    panType: {
      type: String, // Individual / Company / HUF etc.
    },

    panStatus: {
      type: String, // E, N, X etc from PAN Lite
    },

    referenceId: {
      type: String, // Cashfree reference id
    },

    panVerified: {
      type: Boolean,
      default: false,
    },

    // 🔹 MATCH RESULTS (PAN Lite)
    nameMatch: {
      type: Boolean,
      default: false,
    },

    dobMatch: {
      type: Boolean,
      default: false,
    },

    aadhaarLinked: {
      type: String, // Y / R / NA
    },

    // 🔹 TIMESTAMP
    verifiedAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

export default mongoose.model("Kyc", kycSchema);
