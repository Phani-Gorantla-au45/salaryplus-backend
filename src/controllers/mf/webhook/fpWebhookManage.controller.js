import {
  listFpWebhooks,
  createFpWebhook,
  updateFpWebhook,
  setupAllFpWebhooks,
} from "../../../utils/mf/webhook/fpWebhookApi.utils.js";
import FpWebhookEvent from "../../../models/mf/webhook/fpWebhookEvent.model.js";

/**
 * GET /api/mf/admin/webhook/fp
 * List all FP webhook registrations for this tenant.
 */
export const listWebhooks = async (req, res) => {
  try {
    const data = await listFpWebhooks();
    res.json({ data });
  } catch (err) {
    console.error("[WEBHOOK MANAGE] listWebhooks error:", err.response?.data || err.message);
    res.status(502).json({ error: "Failed to fetch webhooks from FP" });
  }
};

/**
 * POST /api/mf/admin/webhook/fp
 * Register a single webhook event at FP.
 * Body: { event, url?, status? }
 */
export const createWebhook = async (req, res) => {
  const { event, url, status = "enabled" } = req.body;

  if (!event) return res.status(400).json({ error: "event is required" });

  const webhookUrl = url || `${process.env.APP_BASE_URL}/api/mf/webhook/fp`;

  try {
    const data = await createFpWebhook({ url: webhookUrl, event, status });
    res.status(201).json({ data });
  } catch (err) {
    console.error("[WEBHOOK MANAGE] createWebhook error:", err.response?.data || err.message);
    res.status(502).json({ error: "Failed to create webhook at FP", detail: err.response?.data });
  }
};

/**
 * PUT /api/mf/admin/webhook/fp/:id
 * Update an existing FP webhook (url or status).
 * Body: { url?, status? }
 */
export const updateWebhook = async (req, res) => {
  const { id } = req.params;
  const { url, status } = req.body;

  if (!url && !status) {
    return res.status(400).json({ error: "Provide at least one of: url, status" });
  }

  try {
    const data = await updateFpWebhook(id, { url, status });
    res.json({ data });
  } catch (err) {
    console.error("[WEBHOOK MANAGE] updateWebhook error:", err.response?.data || err.message);
    res.status(502).json({ error: "Failed to update webhook at FP", detail: err.response?.data });
  }
};

/**
 * POST /api/mf/admin/webhook/fp/setup
 * Register ALL required FP webhook events at once.
 * Idempotent — skips already-registered events.
 */
export const setupWebhooks = async (req, res) => {
  try {
    const results = await setupAllFpWebhooks();
    res.json({ results });
  } catch (err) {
    console.error("[WEBHOOK MANAGE] setupWebhooks error:", err.message);
    res.status(500).json({ error: "Setup failed", detail: err.message });
  }
};

/**
 * POST /api/mf/admin/webhook/fp/update-url
 * Bulk-update the URL on ALL existing FP webhook registrations.
 * Useful when the server domain changes.
 * Body: { url? }  — defaults to APP_BASE_URL/api/mf/webhook/fp
 */
export const updateAllWebhookUrls = async (req, res) => {
  const newUrl = req.body?.url || `${process.env.APP_BASE_URL}/api/mf/webhook/fp`;

  let existing = [];
  try {
    const data = await listFpWebhooks();
    existing = Array.isArray(data) ? data : (data.data || []);
  } catch (err) {
    return res.status(502).json({ error: "Failed to fetch webhooks from FP" });
  }

  const results = { updated: [], skipped: [], failed: [] };

  for (const webhook of existing) {
    if (webhook.url === newUrl) {
      results.skipped.push({ id: webhook.id, event: webhook.event });
      continue;
    }
    try {
      await updateFpWebhook(webhook.id, { url: newUrl, status: webhook.status });
      results.updated.push({ id: webhook.id, event: webhook.event });
    } catch (err) {
      results.failed.push({ id: webhook.id, event: webhook.event, error: err.response?.data || err.message });
    }
  }

  res.json({ newUrl, results });
};

/**
 * GET /api/mf/admin/webhook/fp/events
 * List stored webhook events (with optional filters).
 * Query: ?status=pending|processed|failed&eventType=mf_purchase.successful&limit=50&page=1
 */
export const listStoredEvents = async (req, res) => {
  const { status, eventType, limit = 50, page = 1 } = req.query;

  const filter = {};
  if (status)    filter.status    = status;
  if (eventType) filter.eventType = eventType;

  const skip  = (Number(page) - 1) * Number(limit);
  const total = await FpWebhookEvent.countDocuments(filter);
  const events = await FpWebhookEvent.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .lean();

  res.json({
    data: events,
    meta: { total, page: Number(page), limit: Number(limit) },
  });
};

/**
 * POST /api/mf/admin/webhook/fp/events/:id/replay
 * Re-process a stored event that is in "failed" or "pending" state.
 */
export const replayEvent = async (req, res) => {
  const { id } = req.params;

  const eventDoc = await FpWebhookEvent.findById(id);
  if (!eventDoc) return res.status(404).json({ error: "Event not found" });

  if (eventDoc.status === "processed") {
    return res.status(400).json({ error: "Event already processed successfully" });
  }

  // Reset to pending so dispatcher can re-try
  eventDoc.status     = "pending";
  eventDoc.failReason = null;
  await eventDoc.save();

  const { dispatchWebhookEvent } = await import("../../../utils/mf/webhook/eventDispatcher.js");
  dispatchWebhookEvent(eventDoc).catch((err) => {
    console.error(`[REPLAY] Error replaying event ${id}:`, err.message);
  });

  res.json({ message: "Replay initiated", eventId: id });
};
