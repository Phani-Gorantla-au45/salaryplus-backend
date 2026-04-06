import axios from "axios";
import { getFpToken } from "../fpToken.utils.js";

/**
 * All FP events we subscribe to.
 * Update this list when new event types are required.
 */
export const FP_WEBHOOK_EVENTS = [
  // KYC
  "kyc_request.esign_required",
  "kyc_request.submitted",
  "kyc_request.successful",
  "kyc_request.rejected",
  "kyc_request.expired",

  // Purchase (Lumpsum)
  "mf_purchase.created",
  "mf_purchase.confirmed",
  "mf_purchase.submitted",
  "mf_purchase.successful",
  "mf_purchase.failed",
  "mf_purchase.cancelled",
  "mf_purchase.reversed",

  // Redemption (Withdraw)
  "mf_redemption.created",
  "mf_redemption.confirmed",
  "mf_redemption.submitted",
  "mf_redemption.successful",
  "mf_redemption.failed",
  "mf_redemption.cancelled",
  "mf_redemption.reversed",

  // SIP (Purchase Plan)
  "mf_purchase_plan.created",
  "mf_purchase_plan.activated",
  "mf_purchase_plan.cancelled",
  "mf_purchase_plan.failed",
  "mf_purchase_plan.completed",

  // Mandate
  "mandate.created",
  "mandate.received",
  "mandate.submitted",
  "mandate.approved",
  "mandate.rejected",
  "mandate.cancelled",

  // Payment
  "payment.pending",
  "payment.updated",
  "payment.success",
  "payment.failed",
  "payment.submitted",
  "payment.initiated",
  "payment.approved",
  "payment.rejected",
];

const fpApi = () => axios.create({ baseURL: process.env.FP_API_URL });

// ─────────────────────────────────────────────
//  List all configured webhooks
// ─────────────────────────────────────────────
export const listFpWebhooks = async () => {
  const token = await getFpToken();
  const { data } = await fpApi().get("/v2/notification_webhooks", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
};

// ─────────────────────────────────────────────
//  Create a single webhook registration at FP
// ─────────────────────────────────────────────
export const createFpWebhook = async ({ url, event, status = "enabled" }) => {
  const token = await getFpToken();
  const { data } = await fpApi().post(
    "/v2/notification_webhooks",
    { url, event, status },
    { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
  );
  return data;
};

// ─────────────────────────────────────────────
//  Update an existing webhook (url / status)
// ─────────────────────────────────────────────
export const updateFpWebhook = async (id, { url, status }) => {
  const token = await getFpToken();
  const { data } = await fpApi().put(
    `/v2/notification_webhooks/${id}`,
    { url, status },
    { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
  );
  return data;
};

// ─────────────────────────────────────────────
//  Register ALL required events at once
//  Idempotent: skips events already registered for the same url
// ─────────────────────────────────────────────
export const setupAllFpWebhooks = async () => {
  const webhookUrl = `${process.env.APP_BASE_URL}/api/mf/webhook/fp`;

  // Fetch already-registered webhooks to avoid duplicates
  let existing = [];
  try {
    const res = await listFpWebhooks();
    existing = Array.isArray(res) ? res : (res.data || []);
  } catch (err) {
    console.warn("⚠️  [FP WEBHOOK SETUP] Could not list existing webhooks:", err.message);
  }

  const registeredEvents = new Set(
    existing
      .filter((w) => w.url === webhookUrl && w.status === "enabled")
      .map((w) => w.event)
  );

  const results = { created: [], skipped: [], failed: [] };

  for (const event of FP_WEBHOOK_EVENTS) {
    if (registeredEvents.has(event)) {
      results.skipped.push(event);
      continue;
    }
    try {
      const created = await createFpWebhook({ url: webhookUrl, event });
      results.created.push({ event, id: created.id });
      console.log(`✅ [FP WEBHOOK SETUP] Registered: ${event}`);
    } catch (err) {
      const msg = err.response?.data || err.message;
      results.failed.push({ event, error: msg });
      console.error(`❌ [FP WEBHOOK SETUP] Failed: ${event}`, msg);
    }
  }

  return results;
};
