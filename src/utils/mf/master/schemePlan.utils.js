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

/* GET /v2/mf_scheme_plans/cybrillapoa/:isin?expand=mf_scheme,mf_fund */
export const fetchFpSchemePlan = async (isin) => {
  try {
    const response = await axios.get(
      `${FP_API_URL()}/v2/mf_scheme_plans/cybrillapoa/${isin}`,
      {
        headers: await fpHeaders(),
        params:  { expand: "mf_scheme,mf_fund" },
      }
    );
    console.log(`\n📦 [FP SCHEME] Raw response for ISIN ${isin}:`, JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (err) {
    console.error(`❌ [FP SCHEME] Fetch failed for ISIN ${isin}:`, err.response?.data || err.message);
    throw new Error(err.response?.data?.message || "Failed to fetch scheme plan from FP");
  }
};
