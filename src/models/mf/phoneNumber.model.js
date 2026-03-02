import mongoose from "mongoose";

const phoneNumberSchema = new mongoose.Schema(
  {
    // Our user reference
    uniqueId: {
      type: String,
      required: true,
      index: true,
    },

    // Linked FP investor profile
    fpInvestorProfileId: {
      type: String,
      required: true,
      index: true,
    },

    // FP phone number ID (phone_...)
    fpPhoneNumberId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },

    isd:       { type: String, default: "91" },
    number:    { type: String },
    belongsTo: { type: String, default: null }, // self | spouse | etc.

    rawResponse: {
      type: mongoose.Schema.Types.Mixed,
      select: false,
    },
  },
  { timestamps: true }
);

export default mongoose.model("PhoneNumber", phoneNumberSchema);
