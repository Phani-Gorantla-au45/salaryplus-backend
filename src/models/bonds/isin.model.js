import mongoose from "mongoose";

const bondSchema = new mongoose.Schema(
  {
    isin: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      index: true,
    },
    issuerName: { type: String, required: true },
    faceValue: { type: String, required: true },
    ytm: { type: String, required: true },
    couponRate: { type: String, required: true },
    cashflows: [
      {
        cashflowDate: { type: String },
        recordDate: { type: String },
        cashflowAmount: { type: String },
        principalAmount: { type: String },
        interestAmount: { type: String },
      },
    ],
  },
  {
    timestamps: true,
    collection: "isindata",
  },
);

// This ensures cleaner output in Compass and your API
bondSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret._id;
    delete ret.__v;
    if (ret.cashflows) {
      ret.cashflows.forEach((cf) => delete cf._id);
    }
    return ret;
  },
});

export default mongoose.model("isindata", bondSchema);
