import KycRequest from "../../../../models/mf/kycRequest.model.js";
import MfUserData from "../../../../models/mf/mfUserData.model.js";
import User from "../../../../models/user/user.model.js";
import { resolveUserEmail, resolveUserName, sendWebhookNotification } from "../notification.utils.js";

const ADMIN_EMAIL = "phanigorantla531@gmail.com";

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
    subject: "Your KYC has been approved — Bharat Wealth",
    heading: "KYC Approved!",
    body: (name) =>
      `Hi ${name},\n\nGreat news! Your KYC verification has been successfully completed. You can now start investing through Bharat Wealth.\n\nHappy Investing!`,
  },
  "kyc_request.rejected": {
    subject: "KYC Verification Update — Bharat Wealth",
    heading: "KYC Not Approved",
    body: (name) =>
      `Hi ${name},\n\nUnfortunately, your KYC verification could not be approved at this time. Please log in to the Bharat Wealth app to review and re-submit your documents.`,
  },
  "kyc_request.expired": {
    subject: "Your KYC Request Has Expired — Bharat Wealth",
    heading: "KYC Request Expired",
    body: (name) =>
      `Hi ${name},\n\nYour KYC request has expired. Please log in to the Bharat Wealth app and initiate the KYC process again.`,
  },
  "kyc_request.esign_required": {
    subject: "Action Required: Complete Your eSign — Bharat Wealth",
    heading: "eSign Required to Complete KYC",
    body: (name) =>
      `Hi ${name},\n\nYour KYC application requires an eSign step to proceed. Please open the Bharat Wealth app and complete the eSign process.`,
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

  const { uniqueId } = kycRecord;

  // ── 2. Sync User.mfKycStatus flag ──
  await User.findOneAndUpdate(
    { uniqueId },
    { $set: { mfKycStatus: newStatus } }
  );

  // ── 3. Sync journey status in MfUserData on success ──
  if (eventType === "kyc_request.successful") {
    await MfUserData.updateOne(
      { uniqueId },
      {
        $set: {
          "journey.kycSubmit.status":      "completed",
          "journey.kycSubmit.completedAt": new Date(),
          "journey.canInvest":             true,
        },
      }
    );
  }

  // ── 4. Resolve user details for emails ──
  const [userEmail, userName, userRecord] = await Promise.all([
    resolveUserEmail(uniqueId),
    resolveUserName(uniqueId),
    User.findOne({ uniqueId }).select("phone").lean(),
  ]);

  // ── 5. Email to user ──
  const emailCfg = EMAIL_EVENTS[eventType];
  if (emailCfg && userEmail) {
    await sendWebhookNotification({
      to:      userEmail,
      subject: emailCfg.subject,
      heading: emailCfg.heading,
      body:    emailCfg.body(userName),
    });
  }

  // ── 6. Admin notification for every KYC status change ──
  const adminStatusLabels = {
    "kyc_request.submitted":      "KYC Submitted",
    "kyc_request.esign_required": "eSign Required",
    "kyc_request.successful":     "KYC Successful ✅",
    "kyc_request.rejected":       "KYC Rejected ❌",
    "kyc_request.expired":        "KYC Expired",
  };

  const adminLabel = adminStatusLabels[eventType] ?? eventType;
  const phone = userRecord?.phone ?? "N/A";

  await sendWebhookNotification({
    to:      ADMIN_EMAIL,
    subject: `[Admin] ${adminLabel} — ${userName}`,
    heading: adminLabel,
    body:    `User: ${userName}\nPhone: ${phone}\nKYC Request ID: ${fpKycRequestId}\nNew Status: ${newStatus}\nuniqueId: ${uniqueId}`,
  });
};
