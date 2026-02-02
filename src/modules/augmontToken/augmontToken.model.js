import mongoose from "mongoose";

const augmontTokenSchema = new mongoose.Schema(
  {
    token: { type: String, required: true },
    expiresAt: Date,
  },
  { timestamps: true },
);

export default mongoose.model("AugmontToken", augmontTokenSchema);
