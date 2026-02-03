import mongoose from "mongoose";

const stateSchema = new mongoose.Schema(
  {
    stateId: { type: String, unique: true },
    name: String,
  },
  { timestamps: true },
);

export default mongoose.model("AugmontState", stateSchema);
