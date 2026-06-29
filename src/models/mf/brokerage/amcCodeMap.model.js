import mongoose from "mongoose";

/**
 * CAMS identifies AMCs by a short code (e.g. "B", "H") with no name
 * anywhere in the file. KARVY's per-row "Fund Description" is a per-SCHEME
 * string (e.g. "UTI Nifty Index Fund - Growth"), not a clean parent-AMC
 * name, so grouping by it directly would fragment one AMC's commission
 * across many scheme-description strings instead of rolling it up.
 *
 * Both sources go through this same admin-confirmed mapping (keyed by
 * source + their respective code) so per-AMC totals are never silently
 * guessed. For KARVY, `suggestedName` is auto-derived from the first
 * description seen for that code, as a hint — admin still confirms it by
 * setting `amcName`.
 */
const amcCodeMapSchema = new mongoose.Schema(
  {
    source: { type: String, enum: ["CAMS", "KARVY"], required: true },
    code:   { type: String, required: true, trim: true },
    amcName:       { type: String, default: null, trim: true },
    suggestedName: { type: String, default: null, trim: true },
  },
  { timestamps: true },
);

amcCodeMapSchema.index({ source: 1, code: 1 }, { unique: true });

export default mongoose.model("AmcCodeMap", amcCodeMapSchema);
