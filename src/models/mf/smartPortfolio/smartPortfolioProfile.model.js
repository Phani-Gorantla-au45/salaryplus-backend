import mongoose from "mongoose";

// A single fund within an asset class
const fundSliceSchema = new mongoose.Schema(
  {
    isin:     { type: String, required: true, trim: true, uppercase: true },
    fundName: { type: String, required: true, trim: true },
    amcName:  { type: String, default: null },
    weight:   { type: Number, required: true, min: 1, max: 100 }, // % within asset class, active funds must sum to 100
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

// Allocation formula per asset class: percent = base + (ageMultiplier × age)
// Fixed allocation  → ageMultiplier: 0, e.g. gold: { base: 10, ageMultiplier: 0 }
// Age-based formula → e.g. equity: { base: 100, ageMultiplier: -1 } = 100 - age
//
// Constraint (backend-validated): across all three classes —
//   equity.base + debt.base + gold.base            = 100
//   equity.ageMultiplier + debt.ageMultiplier + gold.ageMultiplier = 0
// This guarantees the three always sum to 100 for any age.
const formulaSchema = new mongoose.Schema(
  {
    base:          { type: Number, required: true },
    ageMultiplier: { type: Number, default: 0 },
    minPercent:    { type: Number, default: 0 },  // floor — never go below this
  },
  { _id: false }
);

const riskLevelFormulaSchema = new mongoose.Schema(
  {
    equity: { type: formulaSchema, required: true },
    debt:   { type: formulaSchema, required: true },
    gold:   { type: formulaSchema, required: true },
  },
  { _id: false }
);

// Singleton config doc
const smartPortfolioConfigSchema = new mongoose.Schema(
  {
    // Fund picks per asset class (admin-managed)
    equity: { type: [fundSliceSchema], default: [] },
    debt:   { type: [fundSliceSchema], default: [] },
    gold:   { type: [fundSliceSchema], default: [] },

    // Allocation formula per risk level (admin-managed)
    formula: {
      moderate: {
        type: riskLevelFormulaSchema,
        default: () => ({
          equity: { base: 100, ageMultiplier: -1, minPercent: 0 },
          debt:   { base: -10, ageMultiplier:  1, minPercent: 0 },
          gold:   { base:  10, ageMultiplier:  0, minPercent: 0 },
        }),
      },
      high: {
        type: riskLevelFormulaSchema,
        default: () => ({
          equity: { base: 70, ageMultiplier: 0, minPercent: 0 },
          debt:   { base: 20, ageMultiplier: 0, minPercent: 0 },
          gold:   { base: 10, ageMultiplier: 0, minPercent: 0 },
        }),
      },
    },
  },
  { timestamps: true }
);

export default mongoose.model("SmartPortfolioConfig", smartPortfolioConfigSchema);
