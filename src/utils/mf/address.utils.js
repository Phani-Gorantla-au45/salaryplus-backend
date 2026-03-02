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

/* POST /v2/addresses */
export const createFpAddress = async (payload) => {
  try {
    console.log("\n📤 [FP ADDRESS] Create payload:", JSON.stringify(payload, null, 2));
    const response = await axios.post(
      `${FP_API_URL()}/v2/addresses`,
      payload,
      { headers: await fpHeaders() }
    );
    console.log("✅ [FP ADDRESS] Created — id:", response.data?.id);
    return response.data;
  } catch (err) {
    console.error("❌ [FP ADDRESS] Create failed:", JSON.stringify(err.response?.data || err.message, null, 2));
    throw new Error(err.response?.data?.message || "Failed to create address");
  }
};

/* GET /v2/addresses/:id */
export const fetchFpAddress = async (addressId) => {
  try {
    const response = await axios.get(
      `${FP_API_URL()}/v2/addresses/${addressId}`,
      { headers: await fpHeaders() }
    );
    return response.data;
  } catch (err) {
    console.error("❌ [FP ADDRESS] Fetch failed:", err.response?.data || err.message);
    throw new Error(err.response?.data?.message || "Failed to fetch address");
  }
};
