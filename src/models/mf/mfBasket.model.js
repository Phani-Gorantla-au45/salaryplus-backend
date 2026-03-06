import mongoose from "mongoose";

const basketFundSchema = new mongoose.Schema(
  {
    isin:                { type: String, required: true, uppercase: true, trim: true },
    fundName:            { type: String, default: null },  // from FP mf_fund.name
    schemeName:          { type: String, default: null },  // from FP mf_scheme.name
    contributionPercent: { type: Number, required: true },  // e.g. 20 means 20%
    minLumpsumAmount:    { type: Number, default: null },  // from thresholds
    minSipAmount:        { type: Number, default: null },  // from thresholds (monthly)
    thresholds:          { type: mongoose.Schema.Types.Mixed, default: [] },
  },
  { _id: false }
);

const mfBasketSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    description: { type: String, default: null },
    riskProfile: {
      type:     String,
      required: true,
      enum:     ["conservative", "moderate", "aggressive"],
    },
    funds:               { type: [basketFundSchema], default: [] },
    basketMinInvestment: { type: Number, default: null }, // min total amount to invest so every fund gets its lumpsum minimum
    active:              { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("MfBasket", mfBasketSchema);
