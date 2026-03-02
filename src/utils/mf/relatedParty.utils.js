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

/* POST /v2/related_parties */
export const createFpRelatedParty = async (payload) => {
  try {
    console.log("\n📤 [FP NOMINEE] Create payload:", JSON.stringify(payload, null, 2));
    const response = await axios.post(
      `${FP_API_URL()}/v2/related_parties`,
      payload,
      { headers: await fpHeaders() }
    );
    console.log("✅ [FP NOMINEE] Created — id:", response.data?.id);
    return response.data;
  } catch (err) {
    console.error("❌ [FP NOMINEE] Create failed:", JSON.stringify(err.response?.data || err.message, null, 2));
    throw new Error(err.response?.data?.message || "Failed to create related party");
  }
};

/* GET /v2/related_parties/:id */
export const fetchFpRelatedParty = async (relatedPartyId) => {
  try {
    const response = await axios.get(
      `${FP_API_URL()}/v2/related_parties/${relatedPartyId}`,
      { headers: await fpHeaders() }
    );
    return response.data;
  } catch (err) {
    console.error("❌ [FP NOMINEE] Fetch failed:", err.response?.data || err.message);
    throw new Error(err.response?.data?.message || "Failed to fetch related party");
  }
};
