import mongoose from "mongoose";

const fundConfigSchema = new mongoose.Schema(
  {
    isin:     { type: String, required: true, trim: true, uppercase: true },
    fundName: { type: String, required: true, trim: true },
    amcName:  { type: String, default: null },

    // Lower rank = higher priority.  Rank determines which fund the engine
    // fills first when the total amount needs to be spread across N funds.
    rank: { type: Number, required: true, min: 1 },

    // Instant redemption rule for this fund (configurable per-fund).
    // Effective daily instant limit =
    //   min(holdings, max(instantLimitRupees, holdings × instantLimitPercent / 100))
    // Defaults match AMFI / FP's current instant redemption rules.
    instantLimitRupees:  { type: Number, default: 50000 },
    instantLimitPercent: { type: Number, default: 90 },    // 90 = 90%

    minInvestmentAmount: { type: Number, default: null },   // scheme minimum
    isActive:            { type: Boolean, default: true },
  },
  { _id: false }
);

const mfSmartSavingV2Schema = new mongoose.Schema(
  {
    name:         { type: String, required: true, trim: true },
    description:  { type: String, default: null },
    isActive:     { type: Boolean, default: true, index: true },
    funds:        { type: [fundConfigSchema], default: [] },
    configuredBy: { type: String, default: null }, // admin email / id
  },
  { timestamps: true }
);

export default mongoose.model("MfSmartSavingV2", mfSmartSavingV2Schema);
