import mongoose from "mongoose";

/*
 * Stores admin-configured funds for each Daily SIP category.
 * One active document per type at any time.
 * Types: smart_savings | short_term | long_term
 */
const mfDailySipFundSchema = new mongoose.Schema(
  {
    type: {
      type:     String,
      required: true,
      enum:     ["smart_savings", "short_term", "long_term"],
      index:    true,
    },

    isin:            { type: String, required: true, trim: true, uppercase: true },
    fundName:        { type: String, required: true, trim: true },
    fundHouseName:   { type: String, required: true, trim: true },
    fundHouseLogo:   { type: String, default: null },   // URL to logo image
    minDailySip:     { type: Number, required: true },  // minimum daily SIP in rupees
    description:     { type: String, default: null },

    isActive:        { type: Boolean, default: true, index: true },
    configuredBy:    { type: String, default: null },   // admin email / id
  },
  { timestamps: true }
);

export default mongoose.model("MfDailySipFund", mfDailySipFundSchema);
