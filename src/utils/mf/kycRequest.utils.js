import axios from "axios";
import { getFpToken } from "./fpToken.utils.js";

const FP_API_URL    = () => process.env.FP_API_URL;
const FP_TENANT_ID  = () => process.env.FP_TENANT_ID;

const fpHeaders = async () => {
  const token = await getFpToken();
  return {
    Authorization:  `Bearer ${token}`,
    "Content-Type": "application/json",
    "x-tenant-id":  FP_TENANT_ID(),
  };
};

/* ------------------------------------------------------------------ */
/*  CREATE KYC REQUEST                                                  */
/*  POST /v2/kyc_requests                                              */
/* ------------------------------------------------------------------ */
export const createFpKycRequest = async (payload) => {
  try {
    const response = await axios.post(
      `${FP_API_URL()}/v2/kyc_requests`,
      payload,
      { headers: await fpHeaders() }
    );
    console.log(`✅ [FP KYC] Request created — id: ${response.data?.id}`);
    return response.data;
  } catch (err) {
    console.error("❌ [FP KYC] Create failed:", err.response?.data || err.message);
    throw new Error(err.response?.data?.message || "Failed to create KYC request");
  }
};

/* ------------------------------------------------------------------ */
/*  UPDATE KYC REQUEST                                                  */
/*  PATCH /v2/kyc_requests/:id                                         */
/* ------------------------------------------------------------------ */
export const updateFpKycRequest = async (kycRequestId, payload) => {
  try {
    console.log(`\n📤 [FP KYC UPDATE] id: ${kycRequestId}`);
    console.log("📤 [FP KYC UPDATE] Payload:", JSON.stringify(payload, null, 2));

    const response = await axios.patch(
      `${FP_API_URL()}/v2/kyc_requests/${kycRequestId}`,
      payload,
      { headers: await fpHeaders() }
    );

    console.log(`✅ [FP KYC UPDATE] Response status: ${response.status}`);
    console.log("✅ [FP KYC UPDATE] Response:", JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (err) {
    console.error("❌ [FP KYC UPDATE] Failed:", JSON.stringify(err.response?.data || err.message, null, 2));
    throw new Error(err.response?.data?.message || "Failed to update KYC request");
  }
};

/* ------------------------------------------------------------------ */
/*  FETCH KYC REQUEST BY ID                                             */
/*  GET /v2/kyc_requests/:id                                           */
/* ------------------------------------------------------------------ */
export const fetchFpKycRequest = async (kycRequestId) => {
  try {
    const response = await axios.get(
      `${FP_API_URL()}/v2/kyc_requests/${kycRequestId}`,
      { headers: await fpHeaders() }
    );
    return response.data;
  } catch (err) {
    console.error("❌ [FP KYC] Fetch failed:", err.response?.data || err.message);
    throw new Error(err.response?.data?.message || "Failed to fetch KYC request");
  }
};

/* ------------------------------------------------------------------ */
/*  LIST KYC REQUESTS                                                   */
/*  GET /v2/kyc_requests?pan=...&status=...                            */
/* ------------------------------------------------------------------ */
export const listFpKycRequests = async (queryParams = {}) => {
  try {
    const response = await axios.get(
      `${FP_API_URL()}/v2/kyc_requests`,
      { headers: await fpHeaders(), params: queryParams }
    );
    return response.data;
  } catch (err) {
    console.error("❌ [FP KYC] List failed:", err.response?.data || err.message);
    throw new Error(err.response?.data?.message || "Failed to list KYC requests");
  }
};

/* ------------------------------------------------------------------ */
/*  SIMULATE KYC REQUEST (Sandbox only)                                 */
/*  POST /v2/kyc_requests/:id/simulate                                 */
/* ------------------------------------------------------------------ */
export const simulateFpKycRequest = async (kycRequestId, status) => {
  try {
    const response = await axios.post(
      `${FP_API_URL()}/v2/kyc_requests/${kycRequestId}/simulate`,
      { status },
      { headers: await fpHeaders() }
    );
    console.log(`✅ [FP KYC] Simulated status: ${status} for id: ${kycRequestId}`);
    return response.data;
  } catch (err) {
    console.error("❌ [FP KYC] Simulate failed:", err.response?.data || err.message);
    throw new Error(err.response?.data?.message || "Failed to simulate KYC request");
  }
};
