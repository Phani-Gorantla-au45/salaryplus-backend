// models/bank.model.js
import mongoose from "mongoose";

const bankSchema = new mongoose.Schema({
  uniqueId: String, // Augmont user id mapping
  accountHolderName: String,
  accountNumber: String,
  ifscCode: String,
  augmontBankId: String,
  status: { type: String, default: "ACTIVE" },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Bank", bankSchema);
