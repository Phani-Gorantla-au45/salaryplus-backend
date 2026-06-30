import axios from "axios";
import { getFpToken } from "../fpToken.utils.js";

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

/* POST /v2/related_parties  (also used for "update" since FP has no PATCH) */
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

/*
 * PATCH /v2/related_parties  (id goes in the body, not the URL)
 * FP caveat: non-mandatory fields can only be ADDED via this API — once a
 * field is set, FP will not let this overwrite it with a different value.
 * Use this only for filling in previously-unset optional fields (e.g.
 * nominee never had an email on file, now adding one). For changing an
 * already-set value, the existing create-and-relink flow in the controller
 * is still what's wired up.
 */
export const updateFpRelatedParty = async (relatedPartyId, payload) => {
  try {
    console.log(`\n📤 [FP NOMINEE] Patch payload (id: ${relatedPartyId}):`, JSON.stringify(payload, null, 2));
    const response = await axios.patch(
      `${FP_API_URL()}/v2/related_parties`,
      { id: relatedPartyId, ...payload },
      { headers: await fpHeaders() }
    );
    console.log("✅ [FP NOMINEE] Patched — id:", response.data?.id);
    return response.data;
  } catch (err) {
    console.error("❌ [FP NOMINEE] Patch failed:", JSON.stringify(err.response?.data || err.message, null, 2));
    throw new Error(err.response?.data?.message || "Failed to update related party");
  }
};

/* GET /v2/related_parties/:id */
export const fetchFpRelatedParty = async (relatedPartyId) => {
  try {
    const response = await axios.get(
      `${FP_API_URL()}/v2/related_parties/${relatedPartyId}`,
      { headers: await fpHeaders() }
    );
    console.log("✅ [FP NOMINEE] Fetched:", JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (err) {
    console.error("❌ [FP NOMINEE] Fetch failed:", err.response?.data || err.message);
    throw new Error(err.response?.data?.message || "Failed to fetch related party");
  }
};
