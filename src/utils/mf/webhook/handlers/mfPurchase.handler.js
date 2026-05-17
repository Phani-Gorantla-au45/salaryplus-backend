import MfPurchase from "../../../../models/mf/purchase/mfPurchase.model.js";
import { resolveUserEmail, resolveUserName, sendInvestmentSuccessEmail } from "../notification.utils.js";

const EVENT_TO_STATE = {
  "mf_purchase.created":    "created",
  "mf_purchase.confirmed":  "confirmed",
  "mf_purchase.submitted":  "submitted",
  "mf_purchase.successful": "successful",
  "mf_purchase.failed":     "failed",
  "mf_purchase.cancelled":  "cancelled",
  "mf_purchase.reversed":   "reversed",
};

// Only send email for successful — no failure emails
const SEND_EMAIL_ON = new Set(["mf_purchase.successful"]);

export const handleMfPurchaseEvent = async (eventType, fpObject) => {
  const fpPurchaseId = fpObject.id;
  const newState     = EVENT_TO_STATE[eventType];

  if (!newState || !fpPurchaseId) return;

  // Update main purchase record
  const purchase = await MfPurchase.findOneAndUpdate(
    { fpPurchaseId },
    { $set: { fpState: newState } },
    { new: true }
  );

  // For basket sub-orders: sync sub-order state
  if (!purchase) {
    if (fpObject.old_id) {
      await MfPurchase.updateOne(
        { "basketOrders.fpOldId": fpObject.old_id },
        { $set: { "basketOrders.$.fpState": newState } }
      );
    }
    console.warn(`[PURCHASE HANDLER] MfPurchase not found for id: ${fpPurchaseId}`);
    return;
  }

  if (!SEND_EMAIL_ON.has(eventType)) return;

  const [email, name] = await Promise.all([
    resolveUserEmail(purchase.uniqueId),
    resolveUserName(purchase.uniqueId),
  ]);

  if (!email) return;

  await sendInvestmentSuccessEmail({
    to:         email,
    name,
    amount:     purchase.amount,
    isBasket:   purchase.isBasketOrder,
    funds:      purchase.basketFunds ?? [],
    schemeName: purchase.schemeName ?? null,
  });
};
