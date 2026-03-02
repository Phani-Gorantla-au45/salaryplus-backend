import axios from "axios";
import { getFpToken } from "./fpToken.utils.js";

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

/* POST /v2/esigns */
export const createFpEsign = async (payload) => {
  try {
    const response = await axios.post(
      `${FP_API_URL()}/v2/esigns`,
      payload,
      { headers: await fpHeaders() }
    );
    console.log(`✅ [FP ESIGN] Created — id: ${response.data?.id}`);
    return response.data;
  } catch (err) {
    console.error("❌ [FP ESIGN] Create failed:", err.response?.data || err.message);
    throw new Error(err.response?.data?.message || "Failed to create esign");
  }
};

/* GET /v2/esigns/:id */
export const fetchFpEsign = async (esignId) => {
  try {
    const response = await axios.get(
      `${FP_API_URL()}/v2/esigns/${esignId}`,
      { headers: await fpHeaders() }
    );
    return response.data;
  } catch (err) {
    console.error("❌ [FP ESIGN] Fetch failed:", err.response?.data || err.message);
    throw new Error(err.response?.data?.message || "Failed to fetch esign");
  }
};
