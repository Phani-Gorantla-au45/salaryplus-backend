import mongoose from "mongoose";

const thresholdSchema = new mongoose.Schema(
  {
    type:                        { type: String },   // lumpsum | sip | withdrawal
    frequency:                   { type: String, default: null }, // daily | monthly (sip only)
    amount_min:                  { type: Number, default: null },
    amount_max:                  { type: Number, default: null },
    amount_multiples:            { type: Number, default: null },
    additional_amount_min:       { type: Number, default: null },
    additional_amount_max:       { type: Number, default: null },
    additional_amount_multiples: { type: Number, default: null },
    units_min:                   { type: Number, default: null },
    units_max:                   { type: Number, default: null },
    units_multiples:             { type: Number, default: null },
    installments_min:            { type: Number, default: null },
    dates:                       { type: [Number], default: [] },
  },
  { _id: false }
);

const mfSchemePlanSchema = new mongoose.Schema(
  {
    isin:            { type: String, required: true, unique: true, index: true, uppercase: true, trim: true },
    fpSchemePlanId:  { type: String, default: null },  // FP internal ID (e.g. mf_scheme_plans/cybrillapoa/INF...)
    gateway:         { type: String, default: "cybrillapoa" },

    // Expanded fields
    schemeName: { type: String, default: null },  // from mf_scheme.name
    fundName:   { type: String, default: null },  // from mf_fund.name

    type:       { type: String, default: null },  // regular | direct
    option:     { type: String, default: null },  // growth | idcw
    idcwOption: { type: String, default: null },  // payout | reinvestment (if idcw)
    active:     { type: Boolean, default: true },

    thresholds: { type: [thresholdSchema], default: [] },

    syncedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("MfSchemePlan", mfSchemePlanSchema);
