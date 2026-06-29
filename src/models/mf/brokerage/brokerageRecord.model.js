import mongoose from "mongoose";

/**
 * One normalized commission line, regardless of whether it came from a
 * CAMS DBF file or a KARVY CSV file — both sources are flattened into
 * this same shape so monthly reports can query across both uniformly.
 *
 * "month" is the period the commission was EARNED for (e.g. the brokerage
 * is for May 2026's AUM), not the month it was posted/credited — this is
 * the field admin filters the monthly report by.
 */
const brokerageRecordSchema = new mongoose.Schema(
  {
    uploadId: { type: mongoose.Schema.Types.ObjectId, ref: "BrokerageUpload", required: true, index: true },
    source:   { type: String, enum: ["CAMS", "KARVY"], required: true },

    month: { type: String, required: true, index: true }, // YYYY-MM, period-based

    amcCode: { type: String, default: null, index: true },
    amcName: { type: String, default: null },

    folioNumber:      { type: String, default: null, index: true },
    schemeCode:        { type: String, default: null },
    investorName:      { type: String, default: null },
    transactionType:   { type: String, default: null },
    transactionAmount: { type: Number, default: null },
    units:             { type: Number, default: null },

    brokerageAmount: { type: Number, required: true },

    periodFrom: { type: Date, default: null },
    periodTo:   { type: Date, default: null },
    postedDate: { type: Date, default: null }, // when the commission was actually credited

    arnCode: { type: String, default: null },

    // Best-effort, resolved at ingestion time via folio → PAN → our user
    uniqueId: { type: String, default: null, index: true },
  },
  { timestamps: true },
);

export default mongoose.model("BrokerageRecord", brokerageRecordSchema);
