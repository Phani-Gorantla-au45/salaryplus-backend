import mongoose from "mongoose";

/* ------------------------------------------------------------------ */
/*  Field Schema — defines each dynamic input on the goal form          */
/* ------------------------------------------------------------------ */
const fieldSchema = new mongoose.Schema(
  {
    key:          { type: String, required: true },   // e.g. "child_age"
    label:        { type: String, required: true },   // e.g. "Child's Current Age"
    type:         { type: String, enum: ["number", "text", "dropdown"], default: "number" },
    defaultValue: { type: mongoose.Schema.Types.Mixed, default: null },
    min:          { type: Number, default: null },
    max:          { type: Number, default: null },
    unit:         { type: String, default: null },    // "₹", "years", "%"
    options:      { type: [String], default: [] },    // for dropdown type
    required:     { type: Boolean, default: true },
  },
  { _id: false }
);

/* ------------------------------------------------------------------ */
/*  Assumptions Schema — default financial rates per goal type          */
/* ------------------------------------------------------------------ */
const assumptionsSchema = new mongoose.Schema(
  {
    inflationRate:        { type: Number, default: 7 },   // % per annum
    returnRate:           { type: Number, default: 12 },  // % expected from investment
    postRetirementReturn: { type: Number, default: 7 },   // % (retirement goal only)
    postRetirementYears:  { type: Number, default: 25 },  // years post retirement
  },
  { _id: false }
);

/* ------------------------------------------------------------------ */
/*  GoalTemplate — system-level, NOT user-specific                      */
/*  Admin seeds these once; users pick from them.                       */
/* ------------------------------------------------------------------ */
const goalTemplateSchema = new mongoose.Schema(
  {
    name:         { type: String, required: true, trim: true },
    type:         { type: String, required: true, unique: true }, // "child_education", "retirement" etc.
    description:  { type: String, default: "" },
    icon:         { type: String, default: null },  // icon name/url for frontend
    fields:       { type: [fieldSchema], default: [] },
    assumptions:  { type: assumptionsSchema, default: () => ({}) },
    displayOrder: { type: Number, default: 0 },
    isActive:     { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("GoalTemplate", goalTemplateSchema);
