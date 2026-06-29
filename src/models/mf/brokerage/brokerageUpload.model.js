import mongoose from "mongoose";

const brokerageUploadSchema = new mongoose.Schema(
  {
    source:     { type: String, enum: ["CAMS", "KARVY"], required: true },
    fileName:   { type: String, required: true },
    uploadedBy: { type: String, default: null }, // admin uniqueId

    status: {
      type: String,
      enum: ["processing", "completed", "failed"],
      default: "processing",
    },

    totalRecords:   { type: Number, default: 0 },
    totalBrokerage: { type: Number, default: 0 },
    months:         { type: [String], default: [] }, // distinct YYYY-MM (period-based) found in this file

    error: { type: String, default: null },
  },
  { timestamps: true },
);

export default mongoose.model("BrokerageUpload", brokerageUploadSchema);
