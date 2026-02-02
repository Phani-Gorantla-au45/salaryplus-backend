import mongoose from "mongoose";

const kycSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    uniqueId: { type: String, required: true },
    panNumber: { type: String, required: true },
    panType: String,
    referenceId: Number,
    panVerified: Boolean,
    verifiedAt: Date,
  },
  { timestamps: true },
);

export default mongoose.model("Kyc", kycSchema);
