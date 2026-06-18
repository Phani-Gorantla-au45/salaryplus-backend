import mongoose from "mongoose";
const { Schema } = mongoose;

const stepResultSchema = new Schema(
  {
    status:      { type: String, enum: ["pending", "success", "failed", "skipped"], default: "pending" },
    error:       { type: String, default: null },
    completedAt: { type: Date,   default: null },
  },
  { _id: false },
);

const migrationRecordSchema = new Schema(
  {
    batchId:   { type: Schema.Types.ObjectId, ref: "MigrationBatch", required: true, index: true },
    rowNumber: { type: Number, required: true },
    rawRow:    { type: Schema.Types.Mixed, default: {} }, // original excel row, for audit/debug

    // Denormalized identity fields for quick listing/search
    phone: { type: String, default: null, index: true },
    pan:   { type: String, default: null, index: true },
    name:  { type: String, default: null },

    uniqueId: { type: String, default: null, index: true }, // set once registration succeeds

    overallStatus: {
      type: String,
      enum: ["pending", "in_progress", "completed", "partial", "failed", "manual_review"],
      default: "pending",
      index: true,
    },
    manualReviewReason: { type: String, default: null },

    steps: {
      registration:      { type: stepResultSchema, default: () => ({}) },
      panVerification:    { type: stepResultSchema, default: () => ({}) },
      investorProfile:    { type: stepResultSchema, default: () => ({}) },
      phone:               { type: stepResultSchema, default: () => ({}) },
      email:               { type: stepResultSchema, default: () => ({}) },
      address:             { type: stepResultSchema, default: () => ({}) },
      bankAccount:         { type: stepResultSchema, default: () => ({}) },
      nominee:             { type: stepResultSchema, default: () => ({}) },
      investmentAccount:  { type: stepResultSchema, default: () => ({}) },
    },

    lastAttemptAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export default mongoose.model("MigrationRecord", migrationRecordSchema);
