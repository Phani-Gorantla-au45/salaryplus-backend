import mongoose from "mongoose";

const mfRedemptionSchema = new mongoose.Schema(
  {
    // Our user reference
    uniqueId: {
      type:     String,
      required: true,
      index:    true,
    },

    // FP redemption order identifiers
    fpRedemptionId: {
      type:   String,
      unique: true,
      sparse: true,
      index:  true,
    },
    fpOldId: { type: Number, default: null },

    // Redemption details
    mfInvestmentAccountId: { type: String, default: null }, // FP MFIA string id
    folioNumber:           { type: String, default: null },
    isin:                  { type: String, uppercase: true, trim: true, default: null },
    amount:                { type: Number, default: null }, // null if units-based
    units:                 { type: Number, default: null }, // null if amount-based
    redemptionMode:        { type: String, enum: ["normal", "instant"], default: "normal" },
    gateway:               { type: String, default: null }, // "rta" for instant redemptions

    // FP order state:
    //   normal:  under_review → pending → confirmed → submitted → succeeded | failed
    //   instant: pending → confirmed → submitted (via RTA gateway)
    fpState: { type: String, default: "under_review" },

    // Consent
    consentGiven: { type: Boolean, default: false },
    consentAt:    { type: Date, default: null },

    // OTP (for internal consent verification)
    otpCode:      { type: String, default: null, select: false },
    otpExpiresAt: { type: Date, default: null },
    otpVerified:  { type: Boolean, default: false },

    // Raw FP response (excluded from default queries)
    rawResponse: { type: mongoose.Schema.Types.Mixed, select: false },
  },
  { timestamps: true }
);

export default mongoose.model("MfRedemption", mfRedemptionSchema);
