import mongoose from "mongoose";

const fpTokenSchema = new mongoose.Schema(
  {
    accessToken: { type: String, required: true },
    expiresAt:   { type: Date,   required: true },
  },
  { timestamps: true }
);

export default mongoose.model("FpToken", fpTokenSchema);
