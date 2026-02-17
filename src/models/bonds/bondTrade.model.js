import mongoose from "mongoose";

const bondTradeSchema = new mongoose.Schema(
  {
    tradeId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    tradeDate: String,
    clientName: String,
    clientPan: String,
    rmName: String,
    issuerName: String,
    isin: String,

    faceValue: String,
    coupon: String,
    allInYield: String,
    clientYield: String,

    units: String,
    totalPurchase: String,
    distributionFee: String,
    channel: String,
    creditRating: String,

    maturityDate: String,
    yieldToOption: String,
    optionDate: String,
  },
  {
    timestamps: true,
    collection: "bond_trades",
  },
);

bondTradeSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model("BondTrade", bondTradeSchema);
