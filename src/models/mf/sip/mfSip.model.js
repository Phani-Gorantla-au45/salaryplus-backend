import mongoose from "mongoose";

/* ------------------------------------------------------------------ */
/*  Sub-schema for basket SIP plans (one entry per fund/FP plan)        */
/* ------------------------------------------------------------------ */
const basketPlanSchema = new mongoose.Schema({
  fpSipId: { type: String, default: null }, // mfpp_xxx
  isin:    { type: String, default: null },
  amount:  { type: Number, default: null },
  fpState: { type: String, default: "created" },
}, { _id: false });

/* ------------------------------------------------------------------ */
/*  Main SIP schema — handles both individual and basket SIPs           */
/* ------------------------------------------------------------------ */
const mfSipSchema = new mongoose.Schema(
  {
    uniqueId: { type: String, required: true, index: true },

    // Primary FP plan id (individual: the plan; basket: the first plan)
    fpSipId: {
      type:   String,
      unique: true,
      sparse: true,
      index:  true,
    },

    // Basket SIP fields
    isBasketSip:  { type: Boolean, default: false },
    basketFunds:  {
      type: [{
        isin:       String,
        amount:     Number,
        schemeName: { type: String, default: null },
        fundName:   { type: String, default: null },
      }],
      default: [],
    },
    basketPlans:  { type: [basketPlanSchema], default: [] },

    // Scheme info (null for basket orders)
    isin:       { type: String, uppercase: true, trim: true, default: null },
    schemeName: { type: String, default: null },
    fundName:   { type: String, default: null },

    // SIP parameters
    mfInvestmentAccountId:    { type: String, default: null },
    frequency:                { type: String, enum: ["daily", "monthly"], required: true },
    amount:                   { type: Number, required: true }, // installment amount (total for basket)
    installmentDay:           { type: Number, default: null }, // 1-28, null for daily
    numberOfInstallments:     { type: Number, default: 120 },
    systematic:               { type: Boolean, default: true },
    folioNumber:              { type: String, default: null },
    generateFirstInstallmentNow: { type: Boolean, default: false },

    // Mandate / payment
    paymentMethod: { type: String, default: "mandate" },
    paymentSource: { type: String, default: null }, // FP mandate id (numeric as string)

    // FP plan state
    // created → review_completed → confirmed → submitted → active | cancelled | completed | failed
    fpState: { type: String, default: "created" },

    // Consent / OTP
    otpCode:      { type: String, default: null, select: false },
    otpExpiresAt: { type: Date,   default: null },
    otpVerified:  { type: Boolean, default: false },
    consentGiven: { type: Boolean, default: false },
    consentAt:    { type: Date,   default: null },

    // FP plan dates (populated after activation)
    startDate:             { type: String, default: null },
    endDate:               { type: String, default: null },
    nextInstallmentDate:   { type: String, default: null },
    remainingInstallments: { type: Number, default: null },

    // Optional linked goal
    linkedGoalId: { type: mongoose.Schema.Types.ObjectId, ref: "UserGoal", default: null },

    // First installment payment (only when paid separately via netbanking)
    fpFirstInstallmentPaymentId: { type: String, default: null },

    // Raw FP responses
    rawSipResponse: { type: mongoose.Schema.Types.Mixed, select: false },
  },
  { timestamps: true }
);

export default mongoose.model("MfSip", mfSipSchema);
