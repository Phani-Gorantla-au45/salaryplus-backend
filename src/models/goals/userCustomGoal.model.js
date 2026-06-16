import mongoose from "mongoose";

const userCustomGoalSchema = new mongoose.Schema(
  {
    uniqueId: { type: String, required: true, index: true },

    // Goal type from goalTypes.config.js
    goalType: {
      type: String,
      enum: ["retirement", "kids_education", "car", "vacation", "marriage", "emergency", "other"],
      required: true,
    },

    // User-defined label (e.g. kid's name for education, custom name for vacation)
    name: { type: String, required: true, trim: true },

    // Raw user inputs (stored as-is for re-calculation / display)
    inputs: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Calculated outputs (computed by frontend or /calculate endpoint)
    targetAmount: { type: Number, required: true },
    monthlySip:   { type: Number, required: true },
    stepUpSip:    { type: Number, default: null },
    stepUpRate:   { type: Number, default: null },

    // Which plan the user chose to save
    chosenPlan: {
      type: String,
      enum: ["sip", "step_up_sip"],
      required: true,
    },

    status: {
      type: String,
      enum: ["active", "completed", "paused", "abandoned"],
      default: "active",
    },

    // Fund mapping (linked later)
    linkedFolioNumbers: { type: [String], default: [] },
    linkedSipId:        { type: String, default: null },
  },
  { timestamps: true },
);

export default mongoose.model("UserCustomGoal", userCustomGoalSchema);
