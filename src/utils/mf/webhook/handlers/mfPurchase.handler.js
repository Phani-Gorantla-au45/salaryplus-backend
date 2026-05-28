import MfPurchase from "../../../../models/mf/purchase/mfPurchase.model.js";
import MfSchemePlan from "../../../../models/mf/master/mfSchemePlan.model.js";
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

  // Enrich basket funds with scheme names
  let funds = purchase.basketFunds ?? [];
  if (purchase.isBasketOrder && funds.length > 0) {
    const isins = funds.map((f) => f.isin).filter(Boolean);
    const schemes = await MfSchemePlan.find(
      { isin: { $in: isins } },
      { isin: 1, schemeName: 1, fundName: 1 }
    ).lean();
    const schemeMap = {};
    for (const s of schemes) schemeMap[s.isin] = s;

    funds = funds.map((f) => ({
      ...f,
      schemeName: schemeMap[f.isin]?.schemeName ?? null,
      fundName:   schemeMap[f.isin]?.fundName   ?? null,
    }));
  }

  await sendInvestmentSuccessEmail({
    to:         email,
    name,
    amount:     purchase.amount,
    isBasket:   purchase.isBasketOrder,
    funds,
    schemeName: purchase.schemeName ?? null,
  });
};
