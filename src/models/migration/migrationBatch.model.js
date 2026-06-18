import mongoose from "mongoose";
const { Schema } = mongoose;

const migrationBatchSchema = new Schema(
  {
    fileName:    { type: String, required: true },
    uploadedBy:  { type: String, default: null }, // admin uniqueId

    totalRows: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ["queued", "processing", "completed", "completed_with_errors", "failed"],
      default: "queued",
    },

    counts: {
      pending:       { type: Number, default: 0 },
      completed:     { type: Number, default: 0 },
      partial:       { type: Number, default: 0 },
      failed:        { type: Number, default: 0 },
      manualReview:  { type: Number, default: 0 },
    },

    startedAt:   { type: Date, default: null },
    completedAt: { type: Date, default: null },
    error:       { type: String, default: null }, // batch-level fatal error (e.g. bad file)
  },
  { timestamps: true },
);

export default mongoose.model("MigrationBatch", migrationBatchSchema);
