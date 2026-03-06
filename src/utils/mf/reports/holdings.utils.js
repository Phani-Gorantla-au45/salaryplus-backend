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
/*  GET /api/oms/investment_accounts/:id/holdings                       */
/*                                                                      */
/*  Generates a holdings report for a given FP investment account.     */
/*                                                                      */
/*  params: {                                                           */
/*    folios  — comma-separated folio numbers (optional)               */
/*    as_on   — date in yyyy-MM-dd format (optional)                   */
/*  }                                                                   */
/* ------------------------------------------------------------------ */
export const fetchFpHoldings = async (investmentAccountId, params = {}) => {
  try {
    console.log(
      `\n📊 [FP HOLDINGS] Fetching holdings for account=${investmentAccountId}, params:`,
      params
    );
    const response = await axios.get(
      `${FP_API_URL()}/api/oms/investment_accounts/${investmentAccountId}/holdings`,
      {
        headers: await fpHeaders(),
        params,
      }
    );
    console.log(`✅ [FP HOLDINGS] Received holdings data`);
    return response.data;
  } catch (err) {
    console.error(
      "❌ [FP HOLDINGS] Fetch failed:",
      JSON.stringify(err.response?.data || err.message, null, 2)
    );
    throw new Error(
      err.response?.data?.message || "Failed to fetch holdings from FP"
    );
  }
};
