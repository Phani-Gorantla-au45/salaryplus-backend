import mongoose from "mongoose";

/**
 * Stores every incoming FP webhook event.
 * Design: save first → respond 200 → process async.
 * Deduplication is done using the event `id` field (unique per FP event).
 */
const fpWebhookEventSchema = new mongoose.Schema(
  {
    // FP event id — e.g. "evt_09ce44d58a1d4d428c4c0ab2bc1922af"
    fpEventId: {
      type:   String,
      unique: true,
      index:  true,
    },

    // Top-level event fields from FP payload
    eventType:  { type: String, required: true, index: true }, // e.g. "mf_purchase.successful"
    objectType: { type: String, default: null },               // e.g. "mf_purchase"

    // FP object id from event.data.object.id
    fpObjectId:    { type: String, default: null, index: true },
    fpObjectOldId: { type: Number, default: null },

    // Processing state
    // pending → processed | failed
    status:     { type: String, default: "pending", index: true },
    failReason: { type: String, default: null },
    processedAt:{ type: Date,   default: null },

    // Full raw payload for auditing / replays
    rawPayload: { type: mongoose.Schema.Types.Mixed, required: true },

    // FP event timestamp
    fpEventTime: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("FpWebhookEvent", fpWebhookEventSchema);
