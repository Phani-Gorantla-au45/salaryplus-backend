import mongoose from "mongoose";

const mfAmcSchema = new mongoose.Schema(
  {
    fpAmcId: { type: Number, unique: true, index: true }, // numeric id from FP
    name:    { type: String, trim: true },
    active:  { type: Boolean, default: true },
    amcCode: { type: String, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("MfAmc", mfAmcSchema);
