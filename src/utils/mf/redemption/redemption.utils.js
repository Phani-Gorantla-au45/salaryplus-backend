import axios from "axios";
import { getFpToken } from "../fpToken.utils.js";

const FP_API_URL = () => process.env.FP_API_URL;
const FP_TENANT_ID = () => process.env.FP_TENANT_ID;

const fpHeaders = async () => {
  const token = await getFpToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "x-tenant-id": FP_TENANT_ID(),
  };
};

/* ------------------------------------------------------------------ */
/*  POST /v2/mf_redemptions                                             */
/*  Creates a redemption order. Enters under_review, moves to pending  */
/*  after async review.                                                 */
/* ------------------------------------------------------------------ */
/** Our AMFI distributor ARN — FP format "ARN-<number>". Override with FP_ARN_CODE. */
const ARN_CODE = () => process.env.FP_ARN_CODE || "ARN-154957";
/**
 * Nippon instant redemptions fail with "arn_code is required for Nippon instant redemption",
 * but FP's /v2/mf_redemptions currently rejects the field ("Unrecognized field 'arn_code'").
 * So it is OFF by default; set FP_SEND_ARN_ON_INSTANT=true once FP confirms the right field.
 */
const SEND_ARN_ON_INSTANT = () => process.env.FP_SEND_ARN_ON_INSTANT === "true";

/** FP returns { error: { status, code, message, errors } } — pull the human message out. */
const fpErrorMessage = (data) =>
  data?.error?.message ||
  (Array.isArray(data?.error?.errors) ? data.error.errors.map((e) => e?.message).filter(Boolean).join(". ") : null) ||
  data?.message ||
  null;

export const createFpRedemption = async (payload) => {
  if (SEND_ARN_ON_INSTANT() && payload?.redemption_mode === "instant" && !payload.arn_code) {
    payload = { ...payload, arn_code: ARN_CODE() };
  }
  const url = `${FP_API_URL()}/v2/mf_redemptions`;
  try {
    console.log(
      "\n📤 [FP REDEMPTION] Create payload:",
      JSON.stringify(payload, null, 2)
    );
    const response = await axios.post(url, payload, { headers: await fpHeaders() });
    console.log(
      `✅ [FP REDEMPTION] Created — id=${response.data?.id} old_id=${response.data?.old_id} state=${response.data?.state}`
    );
    return response.data;
  } catch (err) {
    const status  = err.response?.status ?? null;
    const data    = err.response?.data;
    const hdrs    = err.response?.headers || {};
    const fpMsg   = fpErrorMessage(data);
    // Full, shareable failure report (send this block to FP support)
    console.error(
      "❌ [FP REDEMPTION] Create failed — FP response:\n" +
      JSON.stringify({
        at:           new Date().toISOString(),
        request:      { method: "POST", url, tenant: process.env.FP_TENANT_ID || null, payload },
        response:     { httpStatus: status, body: data ?? null },
        fpRequestId:  hdrs["x-request-id"] || hdrs["x-trace-id"] || hdrs["x-amzn-requestid"] || hdrs["x-correlation-id"] || null,
        networkError: data ? null : err.message,
      }, null, 2)
    );
    const e = new Error(fpMsg || err.message || "Failed to create redemption on FP");
    e.fp = { httpStatus: status, body: data ?? null, message: fpMsg };
    throw e;
  }
};

/* ------------------------------------------------------------------ */
/*  PATCH /v2/mf_redemptions                                            */
/*  Confirms the redemption with investor consent (OTP-verified).       */
/*  Sends state=confirmed + consent in one call.                        */
/* ------------------------------------------------------------------ */
export const patchFpRedemption = async (payload) => {
  try {
    console.log(
      "\n📤 [FP REDEMPTION] PATCH payload:",
      JSON.stringify(payload, null, 2)
    );
    const response = await axios.patch(
      `${FP_API_URL()}/v2/mf_redemptions`,
      payload,
      { headers: await fpHeaders() }
    );
    console.log(
      `✅ [FP REDEMPTION] PATCH done — state=${response.data?.state}`
    );
    return response.data;
  } catch (err) {
    console.error(
      "❌ [FP REDEMPTION] PATCH failed:",
      JSON.stringify(err.response?.data || err.message, null, 2)
    );
    throw new Error(
      err.response?.data?.message || "Failed to update redemption on FP"
    );
  }
};

/* ------------------------------------------------------------------ */
/*  GET /v2/mf_redemptions/:id                                          */
/*  Fetch a single redemption by FP id.                                 */
/* ------------------------------------------------------------------ */
export const fetchFpRedemption = async (fpRedemptionId) => {
  try {
    const response = await axios.get(
      `${FP_API_URL()}/v2/mf_redemptions/${fpRedemptionId}`,
      { headers: await fpHeaders() }
    );
    return response.data;
  } catch (err) {
    console.error(
      `❌ [FP REDEMPTION] Fetch failed for ${fpRedemptionId}:`,
      err.response?.data || err.message
    );
    throw new Error(
      err.response?.data?.message || "Failed to fetch redemption from FP"
    );
  }
};

/* ------------------------------------------------------------------ */
/*  GET /v2/mf_redemptions/summary                                      */
/*  Pre-redemption summary — max/min instant redemption amounts etc.   */
/*                                                                      */
/*  params: { mf_investment_account, folio, scheme }                   */
/* ------------------------------------------------------------------ */
/**
 * Extract { max, min } instant amounts for one scheme+folio from a pre-redemption summary.
 * FP response shape:
 *   { object: "pre_redemption_summary", as_on, schemes: [
 *       { scheme, folio, max_instant_redemption_amount, min_instant_redemption_amount } ] }
 * max = permissible instant amount available TODAY (already net of today's usage).
 */
export const parseFpRedemptionSummary = (summary, scheme, folio) => {
  const rows = Array.isArray(summary?.schemes) ? summary.schemes : [];
  const row =
    rows.find((r) => r.scheme?.toUpperCase() === scheme?.toUpperCase() && String(r.folio) === String(folio)) ??
    rows.find((r) => r.scheme?.toUpperCase() === scheme?.toUpperCase()) ??
    rows[0] ??
    summary; // tolerate a flat response
  const num = (v) => (v == null || isNaN(Number(v)) ? null : Number(v));
  return {
    max: num(row?.max_instant_redemption_amount),
    min: num(row?.min_instant_redemption_amount),
  };
};

export const fetchFpRedemptionSummary = async (params) => {
  try {
    console.log(
      `\n📊 [FP REDEMPTION SUMMARY] Fetching summary, params:`,
      params
    );
    // POST with JSON body — the GET (query-param) variant is marked "To be Deprecated" by FP.
    const response = await axios.post(
      `${FP_API_URL()}/v2/mf_redemptions/summary`,
      params,
      { headers: await fpHeaders() }
    );
    console.log(`✅ [FP REDEMPTION SUMMARY] Response:`, JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (err) {
    console.warn(
      "[FP REDEMPTION SUMMARY] Fetch failed:",
      JSON.stringify(err.response?.data || err.message, null, 2)
    );
    throw new Error(
      err.response?.data?.message || "Failed to fetch redemption summary from FP"
    );
  }
};
