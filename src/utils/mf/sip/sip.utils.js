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
/*  POST /v2/mf_purchase_plans                                          */
/*  Creates a single SIP purchase plan.                                 */
/* ------------------------------------------------------------------ */
export const createFpSip = async (payload) => {
  try {
    console.log("\n📤 [FP SIP] Create payload:", JSON.stringify(payload, null, 2));
    const response = await axios.post(
      `${FP_API_URL()}/v2/mf_purchase_plans`,
      payload,
      { headers: await fpHeaders() }
    );
    console.log(`✅ [FP SIP] Created — id=${response.data?.id} state=${response.data?.state}`);
    return response.data;
  } catch (err) {
    console.error("❌ [FP SIP] Create failed:", JSON.stringify(err.response?.data || err.message, null, 2));
    throw new Error(err.response?.data?.message || "Failed to create SIP on FP");
  }
};

/* ------------------------------------------------------------------ */
/*  POST /v2/mf_purchase_plans/batch                                    */
/*  Creates multiple SIP purchase plans in a single call (basket SIP). */
/*  FP response: { object: "list", data: [ { id, state, ... }, ... ] } */
/* ------------------------------------------------------------------ */
export const createFpBatchSip = async (plans) => {
  try {
    const payload = { mf_purchase_plans: plans };
    console.log(`\n📤 [FP BATCH SIP] Creating ${plans.length} plan(s):`, JSON.stringify(payload, null, 2));
    const response = await axios.post(
      `${FP_API_URL()}/v2/mf_purchase_plans/batch`,
      payload,
      { headers: await fpHeaders() }
    );
    const data = response.data?.data ?? [];
    console.log(`✅ [FP BATCH SIP] Created ${data.length} plan(s) — ids: ${data.map(p => p.id).join(", ")}`);
    return data;
  } catch (err) {
    console.error("❌ [FP BATCH SIP] Create failed:", JSON.stringify(err.response?.data || err.message, null, 2));
    throw new Error(err.response?.data?.message || "Failed to create batch SIP on FP");
  }
};

/* ------------------------------------------------------------------ */
/*  PATCH /v2/mf_purchase_plans                                         */
/*  Updates a single SIP plan (consent + state=confirmed, or cancel).   */
/*  Note: id is in the body, not the path.                              */
/* ------------------------------------------------------------------ */
export const patchFpSip = async (payload) => {
  try {
    console.log(`\n🔄 [FP SIP] PATCH id=${payload.id} state=${payload.state}`);
    const response = await axios.patch(
      `${FP_API_URL()}/v2/mf_purchase_plans`,
      payload,
      { headers: await fpHeaders() }
    );
    console.log(`✅ [FP SIP] PATCH done — state=${response.data?.state}`);
    return response.data;
  } catch (err) {
    console.error("❌ [FP SIP] PATCH failed:", JSON.stringify(err.response?.data || err.message, null, 2));
    throw new Error(err.response?.data?.message || "Failed to update SIP on FP");
  }
};

/* ------------------------------------------------------------------ */
/*  PATCH /v2/mf_purchase_plans/batch                                   */
/*  Confirms multiple SIP plans (basket confirm).                       */
/*  payload: { mf_purchase_plans: [{ id, state, consent }, ...] }      */
/*  FP response: { object: "list", data: [...] }                        */
/* ------------------------------------------------------------------ */
export const patchFpBatchSip = async (plans) => {
  try {
    const payload = { mf_purchase_plans: plans };
    console.log(`\n🔄 [FP BATCH SIP] PATCH ${plans.length} plan(s)`);
    const response = await axios.patch(
      `${FP_API_URL()}/v2/mf_purchase_plans/batch`,
      payload,
      { headers: await fpHeaders() }
    );
    const data = response.data?.data ?? [];
    console.log(`✅ [FP BATCH SIP] PATCH done — states: ${data.map(p => p.state).join(", ")}`);
    return data;
  } catch (err) {
    console.error("❌ [FP BATCH SIP] PATCH failed:", JSON.stringify(err.response?.data || err.message, null, 2));
    throw new Error(err.response?.data?.message || "Failed to confirm batch SIP on FP");
  }
};

/* ------------------------------------------------------------------ */
/*  GET /v2/mf_purchase_plans/:id                                       */
/*  Fetches a single SIP plan by its FP id.                             */
/* ------------------------------------------------------------------ */
export const fetchFpSip = async (fpSipId) => {
  try {
    console.log(`\n📋 [FP SIP] Fetching id=${fpSipId}`);
    const response = await axios.get(
      `${FP_API_URL()}/v2/mf_purchase_plans/${fpSipId}`,
      { headers: await fpHeaders() }
    );
    console.log(`✅ [FP SIP] state=${response.data?.state}`);
    return response.data;
  } catch (err) {
    console.error("❌ [FP SIP] Fetch failed:", JSON.stringify(err.response?.data || err.message, null, 2));
    throw new Error(err.response?.data?.message || "Failed to fetch SIP from FP");
  }
};

/* ------------------------------------------------------------------ */
/*  GET /v2/mf_purchase_plans                                           */
/*  Lists SIP plans with optional filters.                              */
/*  params: { mf_investment_account, states }                          */
/* ------------------------------------------------------------------ */
export const listFpSips = async (params = {}) => {
  try {
    const response = await axios.get(
      `${FP_API_URL()}/v2/mf_purchase_plans`,
      { headers: await fpHeaders(), params }
    );
    return response.data;
  } catch (err) {
    console.error("❌ [FP SIP] List failed:", JSON.stringify(err.response?.data || err.message, null, 2));
    throw new Error(err.response?.data?.message || "Failed to list SIPs from FP");
  }
};
