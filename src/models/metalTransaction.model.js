// models/metalTransaction.model.js
import mongoose from "mongoose";

const metalTxnSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  uniqueId: String,
  metalType: String,
  quantity: Number,
  amount: Number,
  lockPrice: Number,
  merchantTransactionId: String,
  augmontOrderId: String,
  status: { type: String, default: "PENDING" },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("MetalTransaction", metalTxnSchema);
