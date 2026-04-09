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
/*  POST /api/pg/mandates                                               */
/*  Creates an eNACH (E_MANDATE) or UPI Autopay mandate.               */
/*                                                                      */
/*  payload: {                                                          */
/*    mandate_type:   "E_MANDATE" | "UPI"                              */
/*    bank_account_id: Number   (FP bank account old_id)               */
/*    mandate_limit:   Number                                           */
/*    provider_name:   String   (CYBRILLAPOA for ONDC)                 */
/*    valid_from:      String   (yyyy-mm-dd, optional)                 */
/*    valid_to:        String   (yyyy-mm-dd, optional)                 */
/*  }                                                                   */
/*  FP response: { id: Number }                                         */
/* ------------------------------------------------------------------ */
export const createFpMandate = async (payload) => {
  try {
    console.log("\n📤 [FP MANDATE] Create payload:", JSON.stringify(payload, null, 2));
    const response = await axios.post(
      `${FP_API_URL()}/api/pg/mandates`,
      payload,
      { headers: await fpHeaders() }
    );
    console.log(`✅ [FP MANDATE] Created — id=${response.data?.id}`);
    return response.data;
  } catch (err) {
    console.error(
      "❌ [FP MANDATE] Create failed:",
      JSON.stringify(err.response?.data || err.message, null, 2)
    );
    throw new Error(err.response?.data?.message || "Failed to create mandate on FP");
  }
};

/* ------------------------------------------------------------------ */
/*  POST /api/pg/payments/emandate/auth                                 */
/*  Authorizes a mandate — returns token_url for user to complete auth. */
/*                                                                      */
/*  payload: {                                                          */
/*    mandate_id:           Number                                      */
/*    payment_postback_url: String                                      */
/*  }                                                                   */
/*  FP response: { id: Number, token_url: String }                      */
/* ------------------------------------------------------------------ */
export const authorizeFpMandate = async (payload) => {
  try {
    console.log("\n📤 [FP MANDATE AUTH] Payload:", JSON.stringify(payload, null, 2));
    const response = await axios.post(
      `${FP_API_URL()}/api/pg/payments/emandate/auth`,
      payload,
      { headers: await fpHeaders() }
    );
    console.log(`✅ [FP MANDATE AUTH] paymentId=${response.data?.id} tokenUrl=${response.data?.token_url}`);
    return response.data;
  } catch (err) {
    console.error(
      "❌ [FP MANDATE AUTH] Failed:",
      JSON.stringify(err.response?.data || err.message, null, 2)
    );
    throw new Error(err.response?.data?.message || "Failed to authorize mandate on FP");
  }
};

/* ------------------------------------------------------------------ */
/*  POST /api/pg/payments/emandate/auth  (UPI Intent/QR variant)        */
/*  Same endpoint as eNACH auth but with upi.type=uri instead of        */
/*  payment_postback_url. URI is returned directly in response.         */
/*                                                                      */
/*  payload: { mandate_id: Number }                                     */
/*  FP response: { id, token_url, upi: { type, vpa, uri } }            */
/* ------------------------------------------------------------------ */
export const authorizeFpMandateUpi = async (mandateId) => {
  try {
    const payload = {
      mandate_id: mandateId,
      upi: { type: "uri" },
    };
    console.log("\n📤 [FP MANDATE AUTH UPI] Payload:", JSON.stringify(payload, null, 2));
    const response = await axios.post(
      `${FP_API_URL()}/api/pg/payments/emandate/auth`,
      payload,
      { headers: await fpHeaders() }
    );
    console.log(`✅ [FP MANDATE AUTH UPI] paymentId=${response.data?.id} uri=${response.data?.upi?.uri}`);
    return response.data;
  } catch (err) {
    console.error(
      "❌ [FP MANDATE AUTH UPI] Failed:",
      JSON.stringify(err.response?.data || err.message, null, 2)
    );
    throw new Error(err.response?.data?.message || "Failed to authorize UPI mandate on FP");
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/pg/mandates/:id                                            */
/*  Fetches current mandate details from FP.                            */
/* ------------------------------------------------------------------ */
export const fetchFpMandate = async (mandateId) => {
  try {
    console.log(`\n📋 [FP MANDATE] Fetching id=${mandateId}`);
    const response = await axios.get(
      `${FP_API_URL()}/api/pg/mandates/${mandateId}`,
      { headers: await fpHeaders() }
    );
    console.log(`✅ [FP MANDATE] status=${response.data?.mandate_status}`);
    return response.data;
  } catch (err) {
    console.error(
      "❌ [FP MANDATE] Fetch failed:",
      JSON.stringify(err.response?.data || err.message, null, 2)
    );
    throw new Error(err.response?.data?.message || "Failed to fetch mandate from FP");
  }
};

/* ------------------------------------------------------------------ */
/*  POST /api/pg/mandates/:id/cancel                                    */
/*  Cancels an APPROVED mandate.                                        */
/* ------------------------------------------------------------------ */
export const cancelFpMandate = async (mandateId) => {
  try {
    console.log(`\n🚫 [FP MANDATE] Cancelling id=${mandateId}`);
    const response = await axios.post(
      `${FP_API_URL()}/api/pg/mandates/${mandateId}/cancel`,
      {},
      { headers: await fpHeaders() }
    );
    console.log(`✅ [FP MANDATE] Cancelled — status=${response.data?.mandate_status}`);
    return response.data;
  } catch (err) {
    console.error(
      "❌ [FP MANDATE] Cancel failed:",
      JSON.stringify(err.response?.data || err.message, null, 2)
    );
    throw new Error(err.response?.data?.message || "Failed to cancel mandate on FP");
  }
};
