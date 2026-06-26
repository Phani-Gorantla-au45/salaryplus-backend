import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * Tracks an admin-initiated MF order shared with an investor as a payment
 * link. The actual order itself is created exactly the way the app does it
 * (same MfPurchase collection, same FP utils) — this model only adds the
 * secure share token, expiry, and admin audit trail on top.
 */
const adminOrderLinkSchema = new Schema(
  {
    purchaseId: { type: Schema.Types.ObjectId, ref: "MfPurchase", required: true, index: true },
    uniqueId:   { type: String, required: true, index: true }, // investor this order is for

    isBasketOrder: { type: Boolean, default: false },

    shareToken:    { type: String, required: true, unique: true, index: true },
    createdByAdmin: { type: String, required: true },

    status: {
      type: String,
      enum: ["pending", "otp_sent", "otp_verified", "payment_created", "completed", "cancelled", "expired"],
      default: "pending",
    },

    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

export default mongoose.model("AdminOrderLink", adminOrderLinkSchema);
