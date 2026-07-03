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

/* GET /api/onb/countries */
export const fetchFpCountries = async () => {
  try {
    const response = await axios.get(
      `${FP_API_URL()}/api/onb/countries`,
      { headers: await fpHeaders() }
    );
    return response.data?.countries ?? [];
  } catch (err) {
    console.error("❌ [FP COUNTRIES] Fetch failed:", err.response?.data || err.message);
    throw new Error(err.response?.data?.message || "Failed to fetch countries from FP");
  }
};
