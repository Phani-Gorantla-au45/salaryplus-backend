import axios from "axios";
import { getFpToken } from "../fpToken.utils.js";
import MfAmc from "../../../models/mf/master/mfAmc.model.js";

const FP_API_URL = () => process.env.FP_API_URL;
const FP_TENANT_ID = () => process.env.FP_TENANT_ID;

const fpHeaders = async () => {
  const token = await getFpToken();
  return {
    Authorization: `Bearer ${token}`,
    "x-tenant-id": FP_TENANT_ID(),
  };
};

/**
 * Returns a map of { fundName (uppercase) → amclogo } for the given fund names.
 * Single DB query, no error thrown if logo missing.
 */
export const getAmcLogoMap = async (fundNames = []) => {
  if (!fundNames.length) return {};
  const upperNames = [...new Set(fundNames.map((n) => n?.toUpperCase()).filter(Boolean))];
  const amcs = await MfAmc.find(
    { name: { $in: upperNames } },
    { name: 1, amclogo: 1 }
  ).lean();
  const map = {};
  for (const amc of amcs) {
    if (amc.amclogo) map[amc.name.toUpperCase()] = amc.amclogo;
  }
  return map;
};

/* GET /api/oms/amcs — returns full list of AMCs */
export const fetchAllFpAmcs = async () => {
  console.log("inside fetchallFp");
  try {
    const response = await axios.get(`${FP_API_URL()}/api/oms/amcs`, {
      headers: await fpHeaders(),
    });
    console.log("Amc data", response.data);
    // Response shape: { amcs: [ { amc_id, name, active, amc_code } ] }
    return response.data?.amcs ?? [];
  } catch (err) {
    console.error(
      "❌ [FP AMC] Fetch failed:",
      err.response?.data || err.message
    );
    throw new Error(
      err.response?.data?.message || "Failed to fetch AMCs from FP"
    );
  }
};
