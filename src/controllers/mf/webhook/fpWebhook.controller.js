import FpWebhookEvent from "../../../models/mf/webhook/fpWebhookEvent.model.js";
import { verifyFpSignature }    from "../../../utils/mf/webhook/signature.utils.js";
import { dispatchWebhookEvent } from "../../../utils/mf/webhook/eventDispatcher.js";

/**
 * POST /api/mf/webhook/fp
 *
 * Public endpoint — no JWT auth required.
 * FP posts all subscribed events here.
 *
 * Design:
 *  1. Verify FP-Signature
 *  2. Deduplicate by fpEventId
 *  3. Persist raw event to DB
 *  4. Respond 200 immediately
 *  5. Process asynchronously (fire-and-forget)
 */
export const receiveFpWebhook = async (req, res) => {
  const fpSignatureHeader = req.headers["fp-signature"];
  const payload           = req.body;

  // ── Step 1: Signature verification ──
  if (!verifyFpSignature(fpSignatureHeader, payload)) {
    console.warn("⚠️  [FP WEBHOOK] Signature verification failed");
    return res.status(401).json({ error: "Invalid signature" });
  }

  const fpEventId  = payload?.id;
  const eventType  = payload?.type;
  const fpObject   = payload?.data?.object;

  if (!fpEventId || !eventType) {
    return res.status(400).json({ error: "Missing event id or type" });
  }

  // ── Step 2: Deduplicate ──
  const exists = await FpWebhookEvent.exists({ fpEventId });
  if (exists) {
    console.log(`[FP WEBHOOK] Duplicate event ignored: ${fpEventId}`);
    return res.status(200).json({ received: true });
  }

  // ── Step 3: Persist ──
  const objectType = eventType.split(".")[0];
  let eventDoc;
  try {
    eventDoc = await FpWebhookEvent.create({
      fpEventId,
      eventType,
      objectType,
      fpObjectId:    fpObject?.id    || null,
      fpObjectOldId: fpObject?.old_id|| null,
      fpEventTime:   payload.time ? new Date(payload.time) : null,
      rawPayload:    payload,
      status:        "pending",
    });
  } catch (err) {
    // Duplicate key from race condition — already handled
    if (err.code === 11000) {
      return res.status(200).json({ received: true });
    }
    console.error("[FP WEBHOOK] Failed to persist event:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }

  // ── Step 4: Respond immediately ──
  res.status(200).json({ received: true });

  // ── Step 5: Process async ──
  dispatchWebhookEvent(eventDoc).catch((err) => {
    console.error(`[FP WEBHOOK] Async dispatch error for ${fpEventId}:`, err.message);
  });
};
