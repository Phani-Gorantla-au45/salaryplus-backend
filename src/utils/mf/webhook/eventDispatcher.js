import FpWebhookEvent from "../../../models/mf/webhook/fpWebhookEvent.model.js";
import { handleKycRequestEvent }    from "./handlers/kycRequest.handler.js";
import { handleMfPurchaseEvent }    from "./handlers/mfPurchase.handler.js";
import { handleMfRedemptionEvent }  from "./handlers/mfRedemption.handler.js";
import { handleMfPurchasePlanEvent }from "./handlers/mfPurchasePlan.handler.js";
import { handleMandateEvent }       from "./handlers/mandate.handler.js";
import { handlePaymentEvent }       from "./handlers/payment.handler.js";

/**
 * Maps the top-level object type (prefix before the dot) to its handler.
 */
const HANDLERS = {
  kyc_request:       handleKycRequestEvent,
  mf_purchase:       handleMfPurchaseEvent,
  mf_redemption:     handleMfRedemptionEvent,
  mf_purchase_plan:  handleMfPurchasePlanEvent,
  mandate:           handleMandateEvent,
  payment:           handlePaymentEvent,
};

/**
 * Dispatch a saved FpWebhookEvent record to the appropriate handler.
 * Updates the record's status to "processed" or "failed".
 *
 * @param {import('../../../models/mf/webhook/fpWebhookEvent.model.js').default} eventDoc
 */
export const dispatchWebhookEvent = async (eventDoc) => {
  const { eventType, rawPayload } = eventDoc;
  const fpObject = rawPayload?.data?.object;

  // Derive object type from event string (e.g. "mf_purchase.successful" → "mf_purchase")
  const objectType = eventType?.split(".")[0];
  const handler    = HANDLERS[objectType];

  if (!handler) {
    console.warn(`[DISPATCHER] No handler registered for event type: ${eventType}`);
    await FpWebhookEvent.updateOne(
      { _id: eventDoc._id },
      { $set: { status: "processed", processedAt: new Date() } }
    );
    return;
  }

  try {
    await handler(eventType, fpObject || {});
    await FpWebhookEvent.updateOne(
      { _id: eventDoc._id },
      { $set: { status: "processed", processedAt: new Date() } }
    );
    console.log(`✅ [DISPATCHER] Processed event: ${eventType} (${eventDoc.fpEventId})`);
  } catch (err) {
    console.error(`❌ [DISPATCHER] Handler error for ${eventType}:`, err.message);
    await FpWebhookEvent.updateOne(
      { _id: eventDoc._id },
      { $set: { status: "failed", failReason: err.message } }
    );
  }
};
