import mongoose from "mongoose";

const mfPurchaseSchema = new mongoose.Schema(
  {
    // Our user reference
    uniqueId: {
      type:     String,
      required: true,
      index:    true,
    },

    // FP purchase order identifiers
    fpPurchaseId: {
      type:   String,
      unique: true,
      sparse: true,
      index:  true,
    },
    fpOldId: {
      type:    Number,
      default: null,
      // numeric id used in payment API (amc_order_ids)
    },

    // Scheme info (denormalised for convenience)
    isin:       { type: String, uppercase: true, trim: true, default: null },
    schemeName: { type: String, default: null },
    fundName:   { type: String, default: null },

    // Purchase details
    mfInvestmentAccountId: { type: String, default: null }, // FP MFIA id
    amount:                { type: Number, required: true },
    paymentMethod:         { type: String, default: "netbanking" }, // netbanking | upi

    // FP order state (created → payment_pending → payment_captured → submitted → successful | failed)
    fpState: { type: String, default: "created" },

    // Consent
    consentGiven: { type: Boolean, default: false },
    consentAt:    { type: Date, default: null },

    // OTP (for consent verification before payment)
    otpCode:      { type: String, default: null, select: false },
    otpExpiresAt: { type: Date, default: null },
    otpVerified:  { type: Boolean, default: false },

    // Payment
    fpPaymentId: { type: String, default: null },
    tokenUrl:    { type: String, default: null }, // redirect user here to complete payment

    // Raw FP responses (excluded from default queries)
    rawPurchaseResponse: { type: mongoose.Schema.Types.Mixed, select: false },
    rawPaymentResponse:  { type: mongoose.Schema.Types.Mixed, select: false },
  },
  { timestamps: true }
);

export default mongoose.model("MfPurchase", mfPurchaseSchema);
