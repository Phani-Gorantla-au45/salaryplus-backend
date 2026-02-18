import mongoose from "mongoose";

const bondTransactionSchema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      required: true,
      unique: true,
    },

    uniqueId: {
      type: String,
      required: true,
      index: true,
    },

    isin: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },

    units: {
      type: Number,
      required: true,
      min: 1,
    },

    amount: {
      type: Number,
      required: true,
    },

    status: {
      type: String,
      enum: ["PENDING", "SUCCESS", "FAILED"],
      default: "PENDING",
    },

    statusUpdatedAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

export default mongoose.model("BondTransaction", bondTransactionSchema);
