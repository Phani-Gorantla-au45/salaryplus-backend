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

/* POST /v2/investor_profiles */
export const createFpInvestorProfile = async (payload) => {
  try {
    console.log("\n📤 [FP INVESTOR PROFILE] Create payload:", JSON.stringify(payload, null, 2));
    const response = await axios.post(
      `${FP_API_URL()}/v2/investor_profiles`,
      payload,
      { headers: await fpHeaders() }
    );
    console.log("✅ [FP INVESTOR PROFILE] Created — id:", response.data?.id);
    return response.data;
  } catch (err) {
    console.error("❌ [FP INVESTOR PROFILE] Create failed:", JSON.stringify(err.response?.data || err.message, null, 2));
    throw new Error(err.response?.data?.message || "Failed to create investor profile");
  }
};

/* PATCH /v2/investor_profiles/:id */
export const updateFpInvestorProfile = async (profileId, payload) => {
  try {
    console.log(`\n📤 [FP INVESTOR PROFILE] Update id: ${profileId}`);
    console.log("📤 [FP INVESTOR PROFILE] Payload:", JSON.stringify(payload, null, 2));
    const response = await axios.patch(
      `${FP_API_URL()}/v2/investor_profiles/${profileId}`,
      payload,
      { headers: await fpHeaders() }
    );
    console.log("✅ [FP INVESTOR PROFILE] Updated:", JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (err) {
    console.error("❌ [FP INVESTOR PROFILE] Update failed:", JSON.stringify(err.response?.data || err.message, null, 2));
    throw new Error(err.response?.data?.message || "Failed to update investor profile");
  }
};

/* GET /v2/investor_profiles/:id */
export const fetchFpInvestorProfile = async (profileId) => {
  try {
    const response = await axios.get(
      `${FP_API_URL()}/v2/investor_profiles/${profileId}`,
      { headers: await fpHeaders() }
    );
    return response.data;
  } catch (err) {
    console.error("❌ [FP INVESTOR PROFILE] Fetch failed:", err.response?.data || err.message);
    throw new Error(err.response?.data?.message || "Failed to fetch investor profile");
  }
};
