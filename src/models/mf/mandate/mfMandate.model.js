import mongoose from "mongoose";

const mfMandateSchema = new mongoose.Schema(
  {
    // Our user reference
    uniqueId: {
      type:     String,
      required: true,
      index:    true,
    },

    // FP mandate identifier (numeric)
    fpMandateId: {
      type:   Number,
      unique: true,
      sparse: true,
      index:  true,
    },

    // Mandate details
    mandateType:   { type: String, enum: ["E_MANDATE", "UPI"], required: true },
    mandateLimit:  { type: Number, required: true },
    providerName:  { type: String, default: "CYBRILLAPOA" }, // ONDC gateway

    // Date range (stored as string yyyy-mm-dd — matches FP format)
    validFrom: { type: String, default: null },
    validTo:   { type: String, default: null },

    // Investment account reference
    fpInvestmentAccountId: { type: String, default: null, index: true },

    // Bank account reference
    fpBankAccountOldId: { type: Number, default: null }, // FP bank account old_id used when creating

    // FP mandate state
    // created → submitted → approved | rejected | cancelled
    mandateStatus: {
      type:    String,
      default: "created",
      // FP possible values: CREATED, SUBMITTED, APPROVED, REJECTED, CANCELLED
    },

    // FP mandate identifiers
    mandateRef:   { type: String, default: null }, // bank-assigned ref
    mandateToken: { type: String, default: null },
    umrn:         { type: String, default: null }, // Unique Mandate Ref Number (post-approval)

    // Auth payment (from POST /api/pg/payments/emandate/auth)
    fpPaymentId: { type: Number, default: null },
    tokenUrl:    { type: String, default: null }, // redirect user here to complete mandate auth

    // Auth status (updated via postback callback)
    authStatus:   { type: String, default: null }, // success | failure
    authFailureReason: { type: String, default: null },

    // Timestamps from FP
    fpCreatedAt:   { type: Date, default: null },
    fpApprovedAt:  { type: Date, default: null },
    fpCancelledAt: { type: Date, default: null },
    fpRejectedAt:  { type: Date, default: null },
    fpRejectedReason: { type: String, default: null },

    // Raw FP responses (excluded from default queries)
    rawMandateResponse: { type: mongoose.Schema.Types.Mixed, select: false },
    rawAuthResponse:    { type: mongoose.Schema.Types.Mixed, select: false },
  },
  { timestamps: true }
);

export default mongoose.model("MfMandate", mfMandateSchema);
