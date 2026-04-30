import mongoose from "mongoose";

const userGoalSchema = new mongoose.Schema(
  {
    uniqueId:     { type: String, required: true, index: true },
    templateId:   { type: mongoose.Schema.Types.ObjectId, ref: "GoalTemplate", required: true },
    templateType: { type: String, required: true }, // denormalized for fast queries

    // Raw user inputs matching GoalTemplate.fields[].key
    inputs: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Computed outputs (recalculated on demand, persisted for display)
    targetAmount: { type: Number, default: null },  // inflation-adjusted future value (₹)
    monthlySip:   { type: Number, default: null },  // SIP needed per month (₹)
    duration:     { type: Number, default: null },  // years to goal

    // Tracking
    status: {
      type: String,
      enum: ["active", "completed", "paused", "abandoned"],
      default: "active",
    },

    // Optional linked MF SIP / investment for this goal
    linkedSipId: { type: String, default: null },
  },
  { timestamps: true }
);

// One user can have at most one goal of each template type
userGoalSchema.index({ uniqueId: 1, templateType: 1 }, { unique: true });

export default mongoose.model("UserGoal", userGoalSchema);
