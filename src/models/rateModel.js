import mongoose from "mongoose";

const rateSchema = new mongoose.Schema({
  goldRate: Number,
  silverRate: Number,
  updatedAt: { type: Date, default: Date.now },
});

export default mongoose.model("Rates", rateSchema);
