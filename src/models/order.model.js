// models/order.model.js
import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    userId: mongoose.Schema.Types.ObjectId,
    uniqueId: String,

    merchantTransactionId: String,
    augmontOrderId: String,

    addressId: String, // augmontAddressId

    products: [
      {
        sku: String,
        quantity: Number,
      },
    ],

    shippingCharges: Number,

    goldBalance: Number,
    silverBalance: Number,

    status: {
      type: String,
      default: "CREATED",
    },
  },
  { timestamps: true },
);

export default mongoose.model("Order", orderSchema);
