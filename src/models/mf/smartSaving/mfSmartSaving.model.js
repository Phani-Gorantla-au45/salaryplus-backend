import mongoose from "mongoose";

const mfSmartSavingSchema = new mongoose.Schema(
  {
    isin:        { type: String, required: true, trim: true, uppercase: true },
    fundName:    { type: String, required: true, trim: true },
    amcName:     { type: String, required: true, trim: true },
    description: { type: String, default: null },
    isActive:    { type: Boolean, default: true, index: true },

    // Display / UI hints
    minInvestmentAmount:       { type: Number, default: null }, // in rupees
    maxInstantRedemptionAmount: { type: Number, default: null }, // FP limit (e.g. ₹50,000)

    // Who configured it and when
    configuredBy: { type: String, default: null }, // admin email / id
  },
  { timestamps: true }
);

export default mongoose.model("MfSmartSaving", mfSmartSavingSchema);
