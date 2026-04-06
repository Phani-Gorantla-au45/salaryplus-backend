import MfPurchase from "../../../../models/mf/purchase/mfPurchase.model.js";
import { resolveUserEmail, resolveUserName, sendWebhookNotification } from "../notification.utils.js";

/**
 * FP purchase states that map 1-to-1 from event type.
 */
const EVENT_TO_STATE = {
  "mf_purchase.created":   "created",
  "mf_purchase.confirmed": "confirmed",
  "mf_purchase.submitted": "submitted",
  "mf_purchase.successful":"successful",
  "mf_purchase.failed":    "failed",
  "mf_purchase.cancelled": "cancelled",
  "mf_purchase.reversed":  "reversed",
};

const EMAIL_EVENTS = {
  "mf_purchase.successful": {
    subject: "Investment Successful — SalaryPlus",
    heading: "Your Investment is Processed!",
    body: (name, amount) =>
      `Hi ${name},\n\nYour mutual fund investment of ₹${amount} has been successfully processed. Units will be allotted as per the applicable NAV.\n\nThank you for investing with SalaryPlus!`,
  },
  "mf_purchase.failed": {
    subject: "Investment Could Not Be Processed — SalaryPlus",
    heading: "Investment Failed",
    body: (name, amount) =>
      `Hi ${name},\n\nUnfortunately, your mutual fund investment of ₹${amount} could not be processed. If any payment was deducted, it will be refunded within 5-7 business days.\n\nPlease contact support if you need assistance.`,
  },
  "mf_purchase.reversed": {
    subject: "Investment Reversed — SalaryPlus",
    heading: "Investment Order Reversed",
    body: (name, amount) =>
      `Hi ${name},\n\nYour mutual fund investment of ₹${amount} has been reversed. If any payment was deducted, it will be refunded within 5-7 business days.`,
  },
  "mf_purchase.submitted": {
    subject: "Investment Submitted to AMC — SalaryPlus",
    heading: "Investment Order Submitted",
    body: (name, amount) =>
      `Hi ${name},\n\nYour mutual fund investment of ₹${amount} has been submitted to the AMC for processing. Units will be allotted as per the applicable NAV.`,
  },
};

export const handleMfPurchaseEvent = async (eventType, fpObject) => {
  const fpPurchaseId = fpObject.id;
  const newState     = EVENT_TO_STATE[eventType];

  if (!newState || !fpPurchaseId) return;

  // ── 1. Update main purchase record ──
  const purchase = await MfPurchase.findOneAndUpdate(
    { fpPurchaseId },
    { $set: { fpState: newState } },
    { new: true }
  );

  // ── 2. For basket orders: sync sub-order state too ──
  if (!purchase) {
    // Might be a basket sub-order — update by fpOldId inside basketOrders array
    if (fpObject.old_id) {
      await MfPurchase.updateOne(
        { "basketOrders.fpOldId": fpObject.old_id },
        { $set: { "basketOrders.$.fpState": newState } }
      );
    }
    console.warn(`[PURCHASE HANDLER] MfPurchase not found for id: ${fpPurchaseId}`);
    return;
  }

  // ── 3. Email notification ──
  const emailCfg = EMAIL_EVENTS[eventType];
  if (!emailCfg) return;

  const [email, name] = await Promise.all([
    resolveUserEmail(purchase.uniqueId),
    resolveUserName(purchase.uniqueId),
  ]);

  if (!email) return;

  await sendWebhookNotification({
    to:      email,
    subject: emailCfg.subject,
    heading: emailCfg.heading,
    body:    emailCfg.body(name, purchase.amount),
  });
};
