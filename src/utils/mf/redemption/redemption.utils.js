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
export const createFpRedemption = async (payload) => {
  try {
    console.log(
      "\n📤 [FP REDEMPTION] Create payload:",
      JSON.stringify(payload, null, 2)
    );
    const response = await axios.post(
      `${FP_API_URL()}/v2/mf_redemptions`,
      payload,
      { headers: await fpHeaders() }
    );
    console.log(
      `✅ [FP REDEMPTION] Created — id=${response.data?.id} old_id=${response.data?.old_id} state=${response.data?.state}`
    );
    return response.data;
  } catch (err) {
    console.error(
      "❌ [FP REDEMPTION] Create failed:",
      JSON.stringify(err.response?.data || err.message, null, 2)
    );
    throw new Error(
      err.response?.data?.message || "Failed to create redemption on FP"
    );
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
    console.log(`✅ [FP REDEMPTION SUMMARY] Received`);
    return response.data;
  } catch (err) {
    console.error(
      "❌ [FP REDEMPTION SUMMARY] Fetch failed:",
      JSON.stringify(err.response?.data || err.message, null, 2)
    );
    throw new Error(
      err.response?.data?.message || "Failed to fetch redemption summary from FP"
    );
  }
};
