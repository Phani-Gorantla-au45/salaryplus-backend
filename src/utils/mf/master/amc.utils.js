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

/* GET /api/oms/amcs — returns full list of AMCs */
export const fetchAllFpAmcs = async () => {
  try {
    const response = await axios.get(
      `${FP_API_URL()}/api/oms/amcs`,
      { headers: await fpHeaders() }
    );
    // Response shape: { amcs: [ { id, name, active, amc_code } ] }
    return response.data?.amcs ?? [];
  } catch (err) {
    console.error("❌ [FP AMC] Fetch failed:", err.response?.data || err.message);
    throw new Error(err.response?.data?.message || "Failed to fetch AMCs from FP");
  }
};
