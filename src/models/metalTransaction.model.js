// // models/metalTransaction.model.js
// import mongoose from "mongoose";

// const metalTxnSchema = new mongoose.Schema({
//   userId: mongoose.Schema.Types.ObjectId,
//   uniqueId: String,
//   metalType: String,

//   quantity: Number,
//   amount: Number,
//   rate: Number,

//   totalAmount: Number,
//   preTaxAmount: Number,
//   taxAmount: Number,

//   merchantTransactionId: String,
//   augmontOrderId: String,
//   invoiceNumber: String,

//   goldBalance: Number,
//   silverBalance: Number,

//   lockPrice: Number,
//   status: { type: String, default: "PENDING" },
//   createdAt: { type: Date, default: Date.now },
// });

// export default mongoose.model("MetalTransaction", metalTxnSchema);
import mongoose from "mongoose";

const metalTxnSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true,
  },

  uniqueId: String, // Augmont user id

  txnType: {
    type: String,
    enum: ["BUY", "SELL"],
    required: true,
  },

  metalType: {
    type: String,
    enum: ["gold", "silver"],
    required: true,
  },

  quantity: Number,
  amount: Number,

  rate: Number,
  lockPrice: Number,
  blockId: String,

  totalAmount: Number,
  preTaxAmount: Number,
  taxAmount: Number,

  merchantTransactionId: { type: String, unique: true },
  augmontOrderId: String,
  invoiceNumber: String,

  goldBalance: Number,
  silverBalance: Number,

  payoutBankId: String, // SELL only

  providerStatus: String,

  status: {
    type: String,
    enum: ["PENDING", "SUCCESS", "FAILED"],
    default: "PENDING",
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: Date,
});

export default mongoose.model("MetalTransaction", metalTxnSchema);
