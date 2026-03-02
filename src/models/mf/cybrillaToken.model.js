import mongoose from "mongoose";

const cybrillaTokenSchema = new mongoose.Schema(
  {
    accessToken: {
      type: String,
      required: true,
    },
    tokenType: {
      type: String,
      default: "Bearer",
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
);

export default mongoose.model("CybrillaToken", cybrillaTokenSchema);
