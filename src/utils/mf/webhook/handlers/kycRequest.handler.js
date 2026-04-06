import KycRequest from "../../../../models/mf/kycRequest.model.js";
import MfUserData from "../../../../models/mf/mfUserData.model.js";
import { resolveUserEmail, resolveUserName, sendWebhookNotification } from "../notification.utils.js";

/**
 * Maps FP kyc_request event types to local status values.
 */
const EVENT_TO_STATUS = {
  "kyc_request.esign_required": "esign_required",
  "kyc_request.submitted":      "submitted",
  "kyc_request.successful":     "successful",
  "kyc_request.rejected":       "rejected",
  "kyc_request.expired":        "expired",
};

const EMAIL_EVENTS = {
  "kyc_request.successful": {
    subject: "Your KYC has been approved — SalaryPlus",
    heading: "KYC Approved!",
    body: (name) =>
      `Hi ${name},\n\nGreat news! Your KYC verification has been successfully completed. You can now start investing through SalaryPlus.\n\nHappy Investing!`,
  },
  "kyc_request.rejected": {
    subject: "KYC Verification Update — SalaryPlus",
    heading: "KYC Not Approved",
    body: (name) =>
      `Hi ${name},\n\nUnfortunately, your KYC verification could not be approved at this time. Please log in to the SalaryPlus app to review and re-submit your documents.`,
  },
  "kyc_request.expired": {
    subject: "Your KYC Request Has Expired — SalaryPlus",
    heading: "KYC Request Expired",
    body: (name) =>
      `Hi ${name},\n\nYour KYC request has expired. Please log in to the SalaryPlus app and initiate the KYC process again.`,
  },
  "kyc_request.esign_required": {
    subject: "Action Required: Complete Your eSign — SalaryPlus",
    heading: "eSign Required to Complete KYC",
    body: (name) =>
      `Hi ${name},\n\nYour KYC application requires an eSign step to proceed. Please open the SalaryPlus app and complete the eSign process.`,
  },
};

export const handleKycRequestEvent = async (eventType, fpObject) => {
  const fpKycRequestId = fpObject.id;
  const newStatus = EVENT_TO_STATUS[eventType];

  if (!newStatus || !fpKycRequestId) return;

  // ── 1. Update local KycRequest record ──
  const update = { status: newStatus };

  if (eventType === "kyc_request.submitted")     update.fpSubmittedAt  = new Date();
  if (eventType === "kyc_request.successful")    update.fpSuccessfulAt = new Date();
  if (eventType === "kyc_request.rejected")      update.fpRejectedAt   = new Date();
  if (eventType === "kyc_request.expired")       update.fpExpiresAt    = new Date();

  const kycRecord = await KycRequest.findOneAndUpdate(
    { fpKycRequestId },
    { $set: update },
    { new: true }
  );

  if (!kycRecord) {
    console.warn(`[KYC HANDLER] KycRequest not found for id: ${fpKycRequestId}`);
    return;
  }

  // ── 2. Sync journey status in MfUserData on success ──
  if (eventType === "kyc_request.successful") {
    await MfUserData.updateOne(
      { uniqueId: kycRecord.uniqueId },
      {
        $set: {
          "journey.kycSubmit.status":      "completed",
          "journey.kycSubmit.completedAt": new Date(),
          "journey.canInvest":             true,
        },
      }
    );
  }

  // ── 3. Email notification ──
  const emailCfg = EMAIL_EVENTS[eventType];
  if (!emailCfg) return;

  const [email, name] = await Promise.all([
    resolveUserEmail(kycRecord.uniqueId),
    resolveUserName(kycRecord.uniqueId),
  ]);

  if (!email) return;

  await sendWebhookNotification({
    to:      email,
    subject: emailCfg.subject,
    heading: emailCfg.heading,
    body:    emailCfg.body(name),
  });
};
