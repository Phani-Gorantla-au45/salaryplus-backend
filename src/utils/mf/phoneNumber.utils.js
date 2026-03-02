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

/* POST /v2/phone_numbers */
export const createFpPhoneNumber = async (payload) => {
  try {
    console.log("\n📤 [FP PHONE] Create payload:", JSON.stringify(payload, null, 2));
    const response = await axios.post(
      `${FP_API_URL()}/v2/phone_numbers`,
      payload,
      { headers: await fpHeaders() }
    );
    console.log("✅ [FP PHONE] Created — id:", response.data?.id);
    return response.data;
  } catch (err) {
    console.error("❌ [FP PHONE] Create failed:", JSON.stringify(err.response?.data || err.message, null, 2));
    throw new Error(err.response?.data?.message || "Failed to create phone number");
  }
};

/* GET /v2/phone_numbers/:id */
export const fetchFpPhoneNumber = async (phoneNumberId) => {
  try {
    const response = await axios.get(
      `${FP_API_URL()}/v2/phone_numbers/${phoneNumberId}`,
      { headers: await fpHeaders() }
    );
    return response.data;
  } catch (err) {
    console.error("❌ [FP PHONE] Fetch failed:", err.response?.data || err.message);
    throw new Error(err.response?.data?.message || "Failed to fetch phone number");
  }
};
