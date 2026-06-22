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
/*  POST /v2/transactions/reports/fund_scheme_category_wise_aum_summary */
/*                                                                      */
/*  Total AUM broken down by fund category (equity/debt/liquid/others) */
/*  across all of this tenant's investors.                             */
/*                                                                      */
/*  payload: {                                                          */
/*    partner?:        String  (ARN/RIA code)                          */
/*    traded_on_from?: String  (yyyy-MM-dd — default: since inception)  */
/*    traded_on_to?:   String  (yyyy-MM-dd — default: current date)     */
/*  }                                                                   */
/* ------------------------------------------------------------------ */
export const fetchFpAumSummary = async (params = {}) => {
  try {
    console.log(`\n📊 [FP AUM] Fetching fund-category-wise AUM summary`, params);
    const response = await axios.post(
      `${FP_API_URL()}/v2/transactions/reports/fund_scheme_category_wise_aum_summary`,
      params,
      { headers: await fpHeaders() },
    );
    console.log(`✅ [FP AUM] Received AUM summary`);
    return response.data;
  } catch (err) {
    console.error(
      "❌ [FP AUM] Fetch failed:",
      JSON.stringify(err.response?.data || err.message, null, 2),
    );
    throw new Error(err.response?.data?.message || "Failed to fetch AUM summary from FP");
  }
};
