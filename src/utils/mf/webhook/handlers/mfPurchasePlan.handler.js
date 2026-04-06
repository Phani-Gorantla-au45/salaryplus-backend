import MfSip from "../../../../models/mf/sip/mfSip.model.js";
import { resolveUserEmail, resolveUserName, sendWebhookNotification } from "../notification.utils.js";

/**
 * Handles mf_purchase_plan events (SIP).
 * FP plan states: created → review_completed → confirmed → submitted → active | cancelled | completed | failed
 */
const EVENT_TO_STATE = {
  "mf_purchase_plan.created":   "created",
  "mf_purchase_plan.activated": "active",
  "mf_purchase_plan.cancelled": "cancelled",
  "mf_purchase_plan.failed":    "failed",
  "mf_purchase_plan.completed": "completed",
};

const EMAIL_EVENTS = {
  "mf_purchase_plan.activated": {
    subject: "Your SIP is Now Active — SalaryPlus",
    heading: "SIP Activated!",
    body: (name, amount, frequency) =>
      `Hi ${name},\n\nYour ${frequency} SIP of ₹${amount} has been successfully activated. Installments will be auto-debited as per your schedule.\n\nHappy Investing!`,
  },
  "mf_purchase_plan.cancelled": {
    subject: "Your SIP Has Been Cancelled — SalaryPlus",
    heading: "SIP Cancelled",
    body: (name, amount) =>
      `Hi ${name},\n\nYour SIP of ₹${amount} per installment has been cancelled. No further installments will be debited.\n\nIf this was not requested by you, please contact support.`,
  },
  "mf_purchase_plan.failed": {
    subject: "SIP Setup Failed — SalaryPlus",
    heading: "SIP Could Not Be Activated",
    body: (name, amount) =>
      `Hi ${name},\n\nWe were unable to activate your SIP of ₹${amount} per installment. Please contact support or try again from the SalaryPlus app.`,
  },
  "mf_purchase_plan.completed": {
    subject: "Your SIP Has Completed — SalaryPlus",
    heading: "SIP Completed",
    body: (name, amount) =>
      `Hi ${name},\n\nYour SIP of ₹${amount} per installment has successfully completed all scheduled installments. Thank you for investing with SalaryPlus!`,
  },
};

export const handleMfPurchasePlanEvent = async (eventType, fpObject) => {
  // FP SIP plan id is in fpObject.id (e.g. "mfpp_xxx")
  const fpSipId  = fpObject.id;
  const newState = EVENT_TO_STATE[eventType];

  if (!newState || !fpSipId) return;

  // Update both individual SIP and basket SIP sub-plan
  const sip = await MfSip.findOneAndUpdate(
    { fpSipId },
    { $set: { fpState: newState } },
    { new: true }
  );

  // May be a basket sub-plan
  if (!sip) {
    await MfSip.updateOne(
      { "basketPlans.fpSipId": fpSipId },
      { $set: { "basketPlans.$.fpState": newState } }
    );
    console.warn(`[SIP HANDLER] MfSip not found for id: ${fpSipId} (may be basket sub-plan)`);
    return;
  }

  const emailCfg = EMAIL_EVENTS[eventType];
  if (!emailCfg) return;

  const [email, name] = await Promise.all([
    resolveUserEmail(sip.uniqueId),
    resolveUserName(sip.uniqueId),
  ]);

  if (!email) return;

  await sendWebhookNotification({
    to:      email,
    subject: emailCfg.subject,
    heading: emailCfg.heading,
    body:    emailCfg.body(name, sip.amount, sip.frequency),
  });
};
