import mongoose from "mongoose";

/**
 * FP Lookup API results (customer_data_lookup / bank_account_lookup).
 * One document per lookup request. Used only to pre-fill onboarding forms —
 * nothing here is ever sent to FP as verified data without the user confirming it.
 */
const fpLookupSchema = new mongoose.Schema(
  {
    uniqueId: { type: String, required: true, index: true },
    type: { type: String, enum: ["customer_data", "bank_account"], required: true },

    fpLookupId: { type: String, index: true }, // cdl_… / bal_…
    sourceRefId: { type: String },
    status: { type: String, enum: ["pending", "successful", "failed"], default: "pending" },

    phoneNumber: { type: String },
    name: { type: String }, // name sent (customer_data only)

    consent: {
      collected_at: String,
      text: String,
      mode: String,
      ip_address: String,
    },

    data: { type: mongoose.Schema.Types.Mixed, default: null }, // FP `data` hash as returned
    error: { type: String, default: null },
    rawResponse: { type: mongoose.Schema.Types.Mixed, select: false },
  },
  { timestamps: true }
);

fpLookupSchema.index({ uniqueId: 1, type: 1, createdAt: -1 });

export default mongoose.model("FpLookup", fpLookupSchema);
