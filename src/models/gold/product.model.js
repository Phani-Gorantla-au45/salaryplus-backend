import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    sku: { type: String, unique: true },
    name: String,
    metalType: String,
    purity: String,
    jewelleryType: String,
    productWeight: Number,
    redeemWeight: Number,
    basePrice: Number,
    description: String,
    status: String,
    images: [
      {
        url: String,
        displayOrder: Number,
        defaultImage: Boolean,
      },
    ],
  },
  { timestamps: true },
);

export default mongoose.model("AugmontProduct", productSchema);
