import mongoose from "mongoose";

const rateSchema = new mongoose.Schema({
  gBuy: Number,
  gSell: Number,
  sBuy: Number,
  sSell: Number,
  blockId: String,
  updatedAt: { type: Date, default: Date.now },
});

export default mongoose.model("Rates", rateSchema);
