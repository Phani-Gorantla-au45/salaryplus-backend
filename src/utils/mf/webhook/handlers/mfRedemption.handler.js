import MfRedemption from "../../../../models/mf/redemption/mfRedemption.model.js";
import { resolveUserEmail, resolveUserName, sendRedemptionSuccessEmail } from "../notification.utils.js";

const EVENT_TO_STATE = {
  "mf_redemption.created":    "created",
  "mf_redemption.confirmed":  "confirmed",
  "mf_redemption.submitted":  "submitted",
  "mf_redemption.successful": "successful",
  "mf_redemption.failed":     "failed",
  "mf_redemption.cancelled":  "cancelled",
  "mf_redemption.reversed":   "reversed",
};

// Only send email for successful — no failure emails
const SEND_EMAIL_ON = new Set(["mf_redemption.successful"]);

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

  if (!SEND_EMAIL_ON.has(eventType)) return;

  const [email, name] = await Promise.all([
    resolveUserEmail(redemption.uniqueId),
    resolveUserName(redemption.uniqueId),
  ]);

  if (!email) return;

  await sendRedemptionSuccessEmail({
    to:         email,
    name,
    amount:     redemption.amount,
    schemeName: redemption.schemeName ?? null,
  });
};
