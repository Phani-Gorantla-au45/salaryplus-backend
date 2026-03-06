import axios from "axios";
import { getFpToken } from "./fpToken.utils.js";

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

/* POST /v2/bank_accounts */
export const createFpBankAccount = async (payload) => {
  try {
    console.log(
      "\n📤 [FP BANK] Create payload:",
      JSON.stringify(payload, null, 2)
    );
    const response = await axios.post(
      `${FP_API_URL()}/v2/bank_accounts`,
      payload,
      { headers: await fpHeaders() }
    );
    console.log("✅ [FP BANK] Created — id:", response.data?.id);
    return response.data;
  } catch (err) {
    console.error(
      "❌ [FP BANK] Create failed:",
      JSON.stringify(err.response?.data || err.message, null, 2)
    );
    throw new Error(
      err.response?.data?.message || "Failed to create bank account"
    );
  }
};

/* GET /v2/bank_accounts/:id */
export const fetchFpBankAccount = async (bankAccountId) => {
  try {
    const response = await axios.get(
      `${FP_API_URL()}/v2/bank_accounts/${bankAccountId}`,
      { headers: await fpHeaders() }
    );
    return response.data;
  } catch (err) {
    console.error(
      "❌ [FP BANK] Fetch failed:",
      err.response?.data || err.message
    );
    throw new Error(
      err.response?.data?.message || "Failed to fetch bank account"
    );
  }
};

