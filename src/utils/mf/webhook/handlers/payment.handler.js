import MfPurchase from "../../../../models/mf/purchase/mfPurchase.model.js";
import MfMandate  from "../../../../models/mf/mandate/mfMandate.model.js";
import { resolveUserEmail, resolveUserName, sendWebhookNotification } from "../notification.utils.js";

/**
 * Handles payment.* events from FP.
 *
 * FP payment object contains a reference back to the purchase via
 * `payment_type` and `mf_order_ids` / `amc_order_ids`.
 * We use `fpPaymentId` stored on MfPurchase for lookup.
 */
const EMAIL_EVENTS = {
  "payment.success": {
    subject: "Payment Successful — Bharat Wealth",
    heading: "Payment Confirmed!",
    body: (name, amount) =>
      `Hi ${name},\n\nYour payment of ₹${amount || ""} has been successfully received. Your investment order is now being processed.\n\nThank you for investing with Bharat Wealth!`,
  },
  "payment.failed": {
    subject: "Payment Failed — Bharat Wealth",
    heading: "Payment Could Not Be Processed",
    body: (name, amount) =>
      `Hi ${name},\n\nYour payment of ₹${amount || ""} could not be processed. Your investment order has not been placed.\n\nPlease try again from the Bharat Wealth app or contact support for assistance.`,
  },
  "payment.approved": {
    subject: "Payment Approved — Bharat Wealth",
    heading: "Payment Approved",
    body: (name) =>
      `Hi ${name},\n\nYour payment has been approved and is being processed.`,
  },
  "payment.rejected": {
    subject: "Payment Rejected — Bharat Wealth",
    heading: "Payment Rejected",
    body: (name) =>
      `Hi ${name},\n\nYour payment was rejected. Please retry your investment from the Bharat Wealth app or contact support.`,
  },
};

export const handlePaymentEvent = async (eventType, fpObject) => {
  const fpPaymentId = String(fpObject.id || fpObject.old_id || "");
  if (!fpPaymentId) return;

  // ── UPI intent: save URI when payment.updated delivers it ──
  // Applies to both MF purchase UPI and mandate UPI Autopay flows
  if (eventType === "payment.updated") {
    const upiUri = fpObject?.upi?.uri ?? null;
    if (upiUri) {
      // Try purchase first
      const purchaseResult = await MfPurchase.updateOne(
        { fpPaymentId },
        { $set: { upiUri } }
      );
      if (purchaseResult.matchedCount > 0) {
        console.log(`[PAYMENT HANDLER] UPI URI saved to MfPurchase fpPaymentId=${fpPaymentId}`);
      }

      // Also try mandate (UPI Autopay mandate auth payment)
      const mandateResult = await MfMandate.updateOne(
        { fpPaymentId: Number(fpPaymentId) },
        { $set: { upiUri } }
      );
      if (mandateResult.matchedCount > 0) {
        console.log(`[PAYMENT HANDLER] UPI URI saved to MfMandate fpPaymentId=${fpPaymentId}`);
      }

      if (purchaseResult.matchedCount === 0 && mandateResult.matchedCount === 0) {
        console.warn(`[PAYMENT HANDLER] payment.updated — no record found for fpPaymentId=${fpPaymentId}`);
      }
    }
    // payment.updated has no email notification — exit after saving URI
    return;
  }

  // Look up the associated purchase order
  const purchase = await MfPurchase.findOne({ fpPaymentId }).lean();
  if (!purchase) {
    // Not critical — payment events may arrive before or without a linked purchase in some flows
    console.warn(`[PAYMENT HANDLER] No MfPurchase found for fpPaymentId: ${fpPaymentId}`);
    return;
  }

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
    body:    emailCfg.body(name, fpObject.amount || purchase.amount),
  });
};
