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

/* POST /v2/mf_investment_accounts */
export const createFpMfInvestmentAccount = async (payload) => {
  try {
    console.log("\n📤 [FP MF ACCOUNT] Create payload:", JSON.stringify(payload, null, 2));
    const response = await axios.post(
      `${FP_API_URL()}/v2/mf_investment_accounts`,
      payload,
      { headers: await fpHeaders() }
    );
    console.log("✅ [FP MF ACCOUNT] Created — id:", response.data?.id);
    console.log("✅ [FP MF ACCOUNT] Response:", JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (err) {
    console.error("❌ [FP MF ACCOUNT] Create failed:", JSON.stringify(err.response?.data || err.message, null, 2));
    throw new Error(err.response?.data?.message || "Failed to create MF investment account");
  }
};

/* PATCH /v2/mf_investment_accounts  (id goes in body, not URL) */
export const updateFpMfInvestmentAccount = async (accountId, payload) => {
  try {
    const body = { id: accountId, ...payload };
    console.log(`\n📤 [FP MF ACCOUNT] Update id: ${accountId}`);
    console.log("📤 [FP MF ACCOUNT] Payload:", JSON.stringify(body, null, 2));
    const response = await axios.patch(
      `${FP_API_URL()}/v2/mf_investment_accounts`,
      body,
      { headers: await fpHeaders() }
    );
    console.log("✅ [FP MF ACCOUNT] Updated:", JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (err) {
    console.error("❌ [FP MF ACCOUNT] Update failed:", JSON.stringify(err.response?.data || err.message, null, 2));
    throw new Error(err.response?.data?.message || "Failed to update MF investment account");
  }
};

/* GET /v2/mf_investment_accounts/:id */
export const fetchFpMfInvestmentAccount = async (accountId) => {
  try {
    const response = await axios.get(
      `${FP_API_URL()}/v2/mf_investment_accounts/${accountId}`,
      { headers: await fpHeaders() }
    );
    return response.data;
  } catch (err) {
    console.error("❌ [FP MF ACCOUNT] Fetch failed:", err.response?.data || err.message);
    throw new Error(err.response?.data?.message || "Failed to fetch MF investment account");
  }
};
