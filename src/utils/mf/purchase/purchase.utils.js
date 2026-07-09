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
/*  POST /v2/mf_purchases                                               */
/*  Creates a new lumpsum purchase order on FP.                         */
/* ------------------------------------------------------------------ */
export const createFpPurchase = async (payload) => {
  try {
    console.log(
      "\n📤 [FP PURCHASE] Create payload:",
      JSON.stringify(payload, null, 2)
    );
    const response = await axios.post(
      `${FP_API_URL()}/v2/mf_purchases`,
      payload,
      { headers: await fpHeaders() }
    );
    console.log(
      `✅ [FP PURCHASE] Created — id: ${response.data?.id}, old_id: ${response.data?.old_id}`
    );
    return response.data;
  } catch (err) {
    console.error(
      "❌ [FP PURCHASE] Create failed:",
      JSON.stringify(err.response?.data || err.message, null, 2)
    );
    throw new Error(
      err.response?.data?.message || "Failed to create purchase on FP"
    );
  }
};

/* ------------------------------------------------------------------ */
/*  GET /v2/mf_purchases/:id                                            */
/*  Fetch a purchase order by FP ID.                                    */
/* ------------------------------------------------------------------ */
export const fetchFpPurchase = async (fpPurchaseId) => {
  try {
    const response = await axios.get(
      `${FP_API_URL()}/v2/mf_purchases/${fpPurchaseId}`,
      { headers: await fpHeaders() }
    );
    return response.data;
  } catch (err) {
    console.error(
      `❌ [FP PURCHASE] Fetch failed for ${fpPurchaseId}:`,
      err.response?.data || err.message
    );
    throw new Error(
      err.response?.data?.message || "Failed to fetch purchase from FP"
    );
  }
};

/* ------------------------------------------------------------------ */
/*  GET /v2/mf_purchases?plan=<planId>                                  */
/*  Lists purchase orders linked to a SIP plan (first installment).     */
/* ------------------------------------------------------------------ */
export const listFpPurchasesByPlan = async (planId) => {
  try {
    const response = await axios.get(
      `${FP_API_URL()}/v2/mf_purchases`,
      { headers: await fpHeaders(), params: { plan: planId } }
    );
    return response.data?.data ?? [];
  } catch (err) {
    console.error(
      `❌ [FP PURCHASE] List by plan failed for ${planId}:`,
      err.response?.data || err.message
    );
    throw new Error(err.response?.data?.message || "Failed to list purchases from FP");
  }
};

/* ------------------------------------------------------------------ */
/*  PATCH /v2/mf_purchases/:id                                          */
/*  Update a purchase (add consent OR set state=confirmed).             */
/* ------------------------------------------------------------------ */
export const patchFpPurchase = async (fpPurchaseId, payload) => {
  try {
    // FP expects id in body, not in URL path
    const body = { id: fpPurchaseId, ...payload };
    console.log(
      `\n📤 [FP PURCHASE] PATCH /v2/mf_purchases:`,
      JSON.stringify(body, null, 2)
    );
    const response = await axios.patch(
      `${FP_API_URL()}/v2/mf_purchases`,
      body,
      { headers: await fpHeaders() }
    );
    console.log("Patch FP Response", response.data);
    // console.log(`✅ [FP PURCHASE] PATCH done — state: ${response.data?.state}`);
    return response.data;
  } catch (err) {
    console.error(
      `❌ [FP PURCHASE] PATCH failed:`,
      JSON.stringify(err.response?.data || err.message, null, 2)
    );
    throw new Error(
      err.response?.data?.message || "Failed to update purchase on FP"
    );
  }
};

/* ------------------------------------------------------------------ */
/*  POST /api/pg/payments/netbanking                                    */
/*  Initiates payment for one or more MF orders.                        */
/* ------------------------------------------------------------------ */
export const createFpPaymentNetbanking = async (payload) => {
  try {
    console.log(
      "\n📤 [FP PAYMENT] Create netbanking payload:",
      JSON.stringify(payload, null, 2)
    );
    const response = await axios.post(
      `${FP_API_URL()}/api/pg/payments/netbanking`,
      payload,
      { headers: await fpHeaders() }
    );
    console.log("After payment success1", response.data);
    console.log(
      `✅ [FP PAYMENT] Created — id: ${response.data?.id}, token_url: ${response.data?.token_url}`
    );
    return response.data;
  } catch (err) {
    console.error(
      "❌ [FP PAYMENT] Create failed:",
      JSON.stringify(err.response?.data || err.message, null, 2)
    );
    throw new Error(
      err.response?.data?.message || "Failed to initiate payment on FP"
    );
  }
};

/* ------------------------------------------------------------------ */
/*  POST /api/pg/payments/netbanking  (UPI variant)                     */
/*  Same endpoint as netbanking but method=UPI + upi.type=URI.          */
/*  FP returns id + token_url=null + upi.uri=null on creation.          */
/*  A subsequent GET /api/pg/payments/:id is needed to get the URI.     */
/* ------------------------------------------------------------------ */
export const createFpPaymentUpi = async (payload) => {
  try {
    const upiPayload = {
      ...payload,
      method: "UPI",
      upi: { type: "uri" },
    };
    console.log(
      "\n📤 [FP PAYMENT] Create UPI payload:",
      JSON.stringify(upiPayload, null, 2)
    );
    const response = await axios.post(
      `${FP_API_URL()}/api/pg/payments/netbanking`,
      upiPayload,
      { headers: await fpHeaders() }
    );
    console.log(`✅ [FP PAYMENT] UPI payment created — id: ${response.data?.id}`);
    return response.data;
  } catch (err) {
    console.error(
      "❌ [FP PAYMENT] UPI create failed:",
      JSON.stringify(err.response?.data || err.message, null, 2)
    );
    throw new Error(
      err.response?.data?.message || "Failed to initiate UPI payment on FP"
    );
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/pg/payments/:id                                            */
/*  Fetch payment status.                                               */
/* ------------------------------------------------------------------ */
export const fetchFpPayment = async (fpPaymentId) => {
  try {
    const response = await axios.get(
      `${FP_API_URL()}/api/pg/payments/${fpPaymentId}`,
      { headers: await fpHeaders() }
    );
    return response.data;
  } catch (err) {
    console.error(
      `❌ [FP PAYMENT] Fetch failed for ${fpPaymentId}:`,
      err.response?.data || err.message
    );
    throw new Error(
      err.response?.data?.message || "Failed to fetch payment from FP"
    );
  }
};
