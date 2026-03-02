import axios from "axios";
import { getFpToken } from "../fpToken.utils.js";

const FP_API_URL   = () => process.env.FP_API_URL;
const FP_TENANT_ID = () => process.env.FP_TENANT_ID;

const fpHeaders = async () => {
  const token = await getFpToken();
  return {
    Authorization:  `Bearer ${token}`,
    "Content-Type": "application/json",
    "x-tenant-id":  FP_TENANT_ID(),
  };
};

/* ------------------------------------------------------------------ */
/*  POST /v2/mf_purchases                                               */
/*  Creates a new lumpsum purchase order on FP.                         */
/* ------------------------------------------------------------------ */
export const createFpPurchase = async (payload) => {
  try {
    console.log("\n📤 [FP PURCHASE] Create payload:", JSON.stringify(payload, null, 2));
    const response = await axios.post(
      `${FP_API_URL()}/v2/mf_purchases`,
      payload,
      { headers: await fpHeaders() }
    );
    console.log(`✅ [FP PURCHASE] Created — id: ${response.data?.id}, old_id: ${response.data?.old_id}`);
    return response.data;
  } catch (err) {
    console.error("❌ [FP PURCHASE] Create failed:", JSON.stringify(err.response?.data || err.message, null, 2));
    throw new Error(err.response?.data?.message || "Failed to create purchase on FP");
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
    console.error(`❌ [FP PURCHASE] Fetch failed for ${fpPurchaseId}:`, err.response?.data || err.message);
    throw new Error(err.response?.data?.message || "Failed to fetch purchase from FP");
  }
};

/* ------------------------------------------------------------------ */
/*  PATCH /v2/mf_purchases/:id                                          */
/*  Update a purchase (add consent OR set state=confirmed).             */
/* ------------------------------------------------------------------ */
export const patchFpPurchase = async (fpPurchaseId, payload) => {
  try {
    console.log(`\n📤 [FP PURCHASE] PATCH ${fpPurchaseId}:`, JSON.stringify(payload, null, 2));
    const response = await axios.patch(
      `${FP_API_URL()}/v2/mf_purchases/${fpPurchaseId}`,
      payload,
      { headers: await fpHeaders() }
    );
    console.log(`✅ [FP PURCHASE] PATCH done — state: ${response.data?.state}`);
    return response.data;
  } catch (err) {
    console.error(`❌ [FP PURCHASE] PATCH failed:`, JSON.stringify(err.response?.data || err.message, null, 2));
    throw new Error(err.response?.data?.message || "Failed to update purchase on FP");
  }
};

/* ------------------------------------------------------------------ */
/*  POST /api/pg/payments/netbanking                                    */
/*  Initiates payment for one or more MF orders.                        */
/* ------------------------------------------------------------------ */
export const createFpPaymentNetbanking = async (payload) => {
  try {
    console.log("\n📤 [FP PAYMENT] Create netbanking payload:", JSON.stringify(payload, null, 2));
    const response = await axios.post(
      `${FP_API_URL()}/api/pg/payments/netbanking`,
      payload,
      { headers: await fpHeaders() }
    );
    console.log(`✅ [FP PAYMENT] Created — id: ${response.data?.id}, token_url: ${response.data?.token_url}`);
    return response.data;
  } catch (err) {
    console.error("❌ [FP PAYMENT] Create failed:", JSON.stringify(err.response?.data || err.message, null, 2));
    throw new Error(err.response?.data?.message || "Failed to initiate payment on FP");
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
    console.error(`❌ [FP PAYMENT] Fetch failed for ${fpPaymentId}:`, err.response?.data || err.message);
    throw new Error(err.response?.data?.message || "Failed to fetch payment from FP");
  }
};
