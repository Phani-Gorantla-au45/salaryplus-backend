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

/* POST /v2/email_addresses */
export const createFpEmailAddress = async (payload) => {
  try {
    console.log("\n📤 [FP EMAIL] Create payload:", JSON.stringify(payload, null, 2));
    const response = await axios.post(
      `${FP_API_URL()}/v2/email_addresses`,
      payload,
      { headers: await fpHeaders() }
    );
    console.log("✅ [FP EMAIL] Created — id:", response.data?.id);
    return response.data;
  } catch (err) {
    console.error("❌ [FP EMAIL] Create failed:", JSON.stringify(err.response?.data || err.message, null, 2));
    throw new Error(err.response?.data?.message || "Failed to create email address");
  }
};

/* GET /v2/email_addresses/:id */
export const fetchFpEmailAddress = async (emailAddressId) => {
  try {
    const response = await axios.get(
      `${FP_API_URL()}/v2/email_addresses/${emailAddressId}`,
      { headers: await fpHeaders() }
    );
    return response.data;
  } catch (err) {
    console.error("❌ [FP EMAIL] Fetch failed:", err.response?.data || err.message);
    throw new Error(err.response?.data?.message || "Failed to fetch email address");
  }
};
