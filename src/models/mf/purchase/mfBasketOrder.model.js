import mongoose from "mongoose";

/* ------------------------------------------------------------------ */
/*  Sub-schema for each individual purchase order within the batch      */
/* ------------------------------------------------------------------ */
const basketOrderItemSchema = new mongoose.Schema(
  {
    fpPurchaseId:        { type: String, default: null },   // FP mf_purchases id
    fpOldId:             { type: Number, default: null },   // FP numeric old_id (used in payment API)
    purchaseDbId:        { type: mongoose.Schema.Types.ObjectId, ref: "MfPurchase", default: null },
    isin:                { type: String, uppercase: true, trim: true },
    fundName:            { type: String, default: null },
    schemeName:          { type: String, default: null },
    amount:              { type: Number, required: true },
    contributionPercent: { type: Number, default: null }, // % of totalAmount (null for custom orders)
    fpState:             { type: String, default: "created" },
  },
  { _id: false }
);

/* ------------------------------------------------------------------ */
/*  MfBasketOrder — one document per batch purchase session             */
/*                                                                      */
/*  A basket order groups N individual mf_purchases placed via         */
/*  FP's batch API into a single consent + payment flow.               */
/* ------------------------------------------------------------------ */
const mfBasketOrderSchema = new mongoose.Schema(
  {
    uniqueId:    { type: String, required: true, index: true },

    // Which curated basket was used (null if custom fund list)
    basketId:    { type: String, default: null },
    basketName:  { type: String, default: null },
    riskProfile: { type: String, default: null },

    // Total investment amount across all orders
    totalAmount: { type: Number, required: true },

    // Individual purchase orders in this batch
    orders:   { type: [basketOrderItemSchema], default: [] },

    // All FP numeric old_ids in this batch — passed as amc_order_ids to the payment API
    fpOldIds: { type: [Number], default: [] },

    // ── Consent (single OTP covers all orders in the batch) ───────────
    otpCode:      { type: String,  default: null, select: false },
    otpExpiresAt: { type: Date,    default: null },
    otpVerified:  { type: Boolean, default: false },
    consentGiven: { type: Boolean, default: false },
    consentAt:    { type: Date,    default: null },

    // ── Payment (one payment link for all orders) ─────────────────────
    fpPaymentId: { type: String, default: null },
    tokenUrl:    { type: String, default: null }, // redirect user here

    // Overall batch lifecycle state
    // created → consent_given → payment_initiated → completed | failed
    fpBatchState: { type: String, default: "created" },

    // Raw FP responses (excluded from default queries)
    rawBatchResponse:   { type: mongoose.Schema.Types.Mixed, select: false },
    rawPaymentResponse: { type: mongoose.Schema.Types.Mixed, select: false },
  },
  { timestamps: true }
);

export default mongoose.model("MfBasketOrder", mfBasketOrderSchema);
