import axios from "axios";
import { getFpToken } from "../fpToken.utils.js";

const FP_API_URL   = () => process.env.FP_API_URL;
const FP_TENANT_ID = () => process.env.FP_TENANT_ID;

const fpHeaders = async () => {
  const token = await getFpToken();
  return {
    Authorization: `Bearer ${token}`,
    "x-tenant-id": FP_TENANT_ID(),
  };
};

/* GET /v2/mf_scheme_plans?isin=:isin&expand=mf_scheme,mf_fund */
export const fetchFpSchemePlan = async (isin) => {
  try {
    const response = await axios.get(
      `${FP_API_URL()}/v2/mf_scheme_plans`,
      {
        headers: await fpHeaders(),
        params:  { isin, expand: "mf_scheme,mf_fund" },
        timeout: 30000,
      }
    );
    console.log(`\n📦 [FP SCHEME] Raw response for ISIN ${isin}:`, JSON.stringify(response.data, null, 2));
    // FP returns paginated list; grab the first matching plan
    const data = response.data;
    const plan = Array.isArray(data?.data) ? data.data[0] : data;
    if (!plan) throw new Error(`No scheme plan found on FP for ISIN: ${isin}`);
    return plan;
  } catch (err) {
    console.error(`❌ [FP SCHEME] Fetch failed for ISIN ${isin}:`, err.response?.data || err.message);
    throw new Error(err.response?.data?.message || err.message || "Failed to fetch scheme plan from FP");
  }
};
