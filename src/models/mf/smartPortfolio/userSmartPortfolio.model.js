import mongoose from "mongoose";

const fundAllocationSchema = new mongoose.Schema(
  {
    isin:       { type: String, required: true },
    fundName:   { type: String, required: true },
    amcName:    { type: String, default: null },
    assetClass: { type: String, enum: ["equity", "debt", "gold"], required: true },
    weight:     { type: Number, required: true }, // effective % of total portfolio
    minLumpsumAmount: { type: Number, default: null },
    minSipAmount:     { type: Number, default: null },
    amount:     { type: Number, default: null },  // set at invest time
  },
  { _id: false }
);

const userSmartPortfolioSchema = new mongoose.Schema(
  {
    uniqueId:  { type: String, required: true, index: true },
    riskLevel: { type: String, enum: ["moderate", "high"], required: true },

    inputs: {
      age: { type: Number, required: true },
    },

    // Locked allocation snapshot at save time
    allocation: {
      equity: { type: Number, required: true },
      debt:   { type: Number, required: true },
      gold:   { type: Number, required: true },
    },

    funds: { type: [fundAllocationSchema], default: [] },
    // Smallest total so every fund gets at least its own minimum
    minLumpsumInvestment: { type: Number, default: null },
    minSipInvestment:     { type: Number, default: null },

    status:         { type: String, enum: ["saved", "invested"], default: "saved" },
    investmentType: { type: String, enum: ["lumpsum", "sip", null], default: null },

    linkedOrderIds: { type: [String], default: [] },
    linkedSipId:    { type: String, default: null },

    assignedByAdmin: { type: Boolean, default: false },
    adminNote:       { type: String, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("UserSmartPortfolio", userSmartPortfolioSchema);
