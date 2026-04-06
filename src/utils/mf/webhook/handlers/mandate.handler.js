import MfMandate from "../../../../models/mf/mandate/mfMandate.model.js";
import { resolveUserEmail, resolveUserName, sendWebhookNotification } from "../notification.utils.js";

/**
 * FP mandate state flow: created → submitted → approved | rejected | cancelled
 * FP sends status values in UPPERCASE in some places; we normalise to lowercase.
 */
const EVENT_TO_STATUS = {
  "mandate.created":   "created",
  "mandate.received":  "received",
  "mandate.submitted": "submitted",
  "mandate.approved":  "approved",
  "mandate.rejected":  "rejected",
  "mandate.cancelled": "cancelled",
};

const EMAIL_EVENTS = {
  "mandate.approved": {
    subject: "Mandate Approved — SalaryPlus",
    heading: "Your Mandate is Active!",
    body: (name) =>
      `Hi ${name},\n\nYour eNACH / UPI Autopay mandate has been successfully approved. Your SIP installments will now be auto-debited as scheduled.\n\nHappy Investing!`,
  },
  "mandate.rejected": {
    subject: "Mandate Registration Failed — SalaryPlus",
    heading: "Mandate Not Approved",
    body: (name) =>
      `Hi ${name},\n\nYour mandate registration could not be approved by your bank. Please log in to the SalaryPlus app to register a new mandate.\n\nContact support if you need help.`,
  },
  "mandate.cancelled": {
    subject: "Mandate Cancelled — SalaryPlus",
    heading: "Mandate Cancelled",
    body: (name) =>
      `Hi ${name},\n\nYour mandate has been cancelled. Any active SIPs linked to this mandate may be affected. Please register a new mandate from the SalaryPlus app if needed.`,
  },
};

export const handleMandateEvent = async (eventType, fpObject) => {
  // Mandate id in FP events — could be numeric (old_id) or prefixed string
  // MfMandate.fpMandateId is stored as Number
  const fpMandateId = fpObject.old_id ?? fpObject.id;
  const newStatus   = EVENT_TO_STATUS[eventType];

  if (!newStatus) return;

  const update = { mandateStatus: newStatus };

  if (eventType === "mandate.approved")  update.fpApprovedAt  = new Date();
  if (eventType === "mandate.rejected")  {
    update.fpRejectedAt     = new Date();
    update.fpRejectedReason = fpObject.rejection_reason || null;
  }
  if (eventType === "mandate.cancelled") update.fpCancelledAt = new Date();

  // Also capture UMRN if present in the FP object
  if (fpObject.umrn) update.umrn = fpObject.umrn;

  const query = typeof fpMandateId === "number"
    ? { fpMandateId }
    : { fpMandateId: Number(fpMandateId) };

  const mandate = await MfMandate.findOneAndUpdate(
    query,
    { $set: update },
    { new: true }
  );

  if (!mandate) {
    console.warn(`[MANDATE HANDLER] MfMandate not found for id: ${fpMandateId}`);
    return;
  }

  const emailCfg = EMAIL_EVENTS[eventType];
  if (!emailCfg) return;

  const [email, name] = await Promise.all([
    resolveUserEmail(mandate.uniqueId),
    resolveUserName(mandate.uniqueId),
  ]);

  if (!email) return;

  await sendWebhookNotification({
    to:      email,
    subject: emailCfg.subject,
    heading: emailCfg.heading,
    body:    emailCfg.body(name),
  });
};
