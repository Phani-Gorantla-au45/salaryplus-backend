import mongoose from "mongoose";

const mfLamfSchema = new mongoose.Schema(
  {
    uniqueId:    { type: String, required: true, unique: true, index: true },
    finsireId:   { type: String, required: true },
    finsireLink: { type: String, default: null },
    phone:       { type: String, default: null },
    pan:         { type: String, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("MfLamf", mfLamfSchema);
