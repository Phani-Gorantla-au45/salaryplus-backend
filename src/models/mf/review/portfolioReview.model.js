import mongoose from "mongoose";

/**
 * One document per review CYCLE (not one per client) — so history is just
 * "all docs for this uniqueId" and "next review" is the latest non-completed
 * one. When a cycle is completed, the next cycle (6 months out) is created
 * automatically — see reviewScheduler.utils.js.
 */
const portfolioReviewSchema = new mongoose.Schema(
  {
    uniqueId:    { type: String, required: true, index: true },
    cycleNumber: { type: Number, required: true }, // 1st review, 2nd review... for this client

    scheduledDate: { type: Date, required: true }, // current target date (may have been moved by advisor)
    defaultDate:   { type: Date, required: true }, // what the system originally computed (audit reference)

    status: {
      type: String,
      enum: ["SCHEDULED", "OVERDUE", "COMPLETED"],
      default: "SCHEDULED",
      index: true,
    },

    rescheduledFrom: { type: Date, default: null },
    rescheduledBy:   { type: String, default: null }, // admin uniqueId
    rescheduledAt:   { type: Date, default: null },

    completedAt:  { type: Date, default: null },
    completedBy:  { type: String, default: null }, // admin uniqueId
    keyPoints:    { type: [String], default: [] }, // advisor's notes, shown to the user

    // Forward-compat for multi-advisor: not used yet (single-advisor platform
    // today), but avoids a schema migration when that becomes real.
    advisorId: { type: String, default: null },
  },
  { timestamps: true },
);

portfolioReviewSchema.index({ uniqueId: 1, scheduledDate: -1 });
portfolioReviewSchema.index({ status: 1, scheduledDate: 1 });

export default mongoose.model("PortfolioReview", portfolioReviewSchema);
