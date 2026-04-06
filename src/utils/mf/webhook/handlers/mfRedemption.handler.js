import MfRedemption from "../../../../models/mf/redemption/mfRedemption.model.js";
import { resolveUserEmail, resolveUserName, sendWebhookNotification } from "../notification.utils.js";

const EVENT_TO_STATE = {
  "mf_redemption.created":   "created",
  "mf_redemption.confirmed": "confirmed",
  "mf_redemption.submitted": "submitted",
  "mf_redemption.successful":"successful",
  "mf_redemption.failed":    "failed",
  "mf_redemption.cancelled": "cancelled",
  "mf_redemption.reversed":  "reversed",
};

const EMAIL_EVENTS = {
  "mf_redemption.successful": {
    subject: "Withdrawal Successful — SalaryPlus",
    heading: "Your Withdrawal is Processed!",
    body: (name, amount) => {
      const amtText = amount ? `₹${amount}` : "your redemption";
      return `Hi ${name},\n\nYour mutual fund withdrawal of ${amtText} has been successfully processed. The proceeds will be credited to your registered bank account within 2-3 business days.\n\nThank you for using SalaryPlus!`;
    },
  },
  "mf_redemption.failed": {
    subject: "Withdrawal Could Not Be Processed — SalaryPlus",
    heading: "Withdrawal Failed",
    body: (name, amount) => {
      const amtText = amount ? `₹${amount}` : "your redemption";
      return `Hi ${name},\n\nUnfortunately, your withdrawal of ${amtText} could not be processed. Please contact support or try again from the SalaryPlus app.`;
    },
  },
  "mf_redemption.submitted": {
    subject: "Withdrawal Submitted to AMC — SalaryPlus",
    heading: "Withdrawal Submitted",
    body: (name) =>
      `Hi ${name},\n\nYour withdrawal request has been submitted to the AMC for processing. Proceeds will be credited once processed.`,
  },
  "mf_redemption.reversed": {
    subject: "Withdrawal Reversed — SalaryPlus",
    heading: "Withdrawal Reversed",
    body: (name) =>
      `Hi ${name},\n\nYour withdrawal order has been reversed. Please contact support if you have any questions.`,
  },
};

export const handleMfRedemptionEvent = async (eventType, fpObject) => {
  const fpRedemptionId = fpObject.id;
  const newState       = EVENT_TO_STATE[eventType];

  if (!newState || !fpRedemptionId) return;

  const redemption = await MfRedemption.findOneAndUpdate(
    { fpRedemptionId },
    { $set: { fpState: newState } },
    { new: true }
  );

  if (!redemption) {
    console.warn(`[REDEMPTION HANDLER] MfRedemption not found for id: ${fpRedemptionId}`);
    return;
  }

  const emailCfg = EMAIL_EVENTS[eventType];
  if (!emailCfg) return;

  const [email, name] = await Promise.all([
    resolveUserEmail(redemption.uniqueId),
    resolveUserName(redemption.uniqueId),
  ]);

  if (!email) return;

  await sendWebhookNotification({
    to:      email,
    subject: emailCfg.subject,
    heading: emailCfg.heading,
    body:    emailCfg.body(name, redemption.amount),
  });
};
