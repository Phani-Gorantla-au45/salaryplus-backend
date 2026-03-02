import axios from "axios";
import { getFpToken } from "./fpToken.utils.js";

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

/* POST /v2/identity_documents */
export const createFpIdentityDocument = async (payload) => {
  try {
    const response = await axios.post(
      `${FP_API_URL()}/v2/identity_documents`,
      payload,
      { headers: await fpHeaders() }
    );
    console.log("Identity document");
    console.log(`✅ [FP IDDOC] Created — id: ${response.data?.id}`);
    return response.data;
  } catch (err) {
    console.error(
      "❌ [FP IDDOC] Create failed:",
      err.response?.data || err.message
    );
    throw new Error(
      err.response?.data?.message || "Failed to create identity document"
    );
  }
};

/* GET /v2/identity_documents/:id */
export const fetchFpIdentityDocument = async (idDocId) => {
  try {
    const response = await axios.get(
      `${FP_API_URL()}/v2/identity_documents/${idDocId}`,
      { headers: await fpHeaders() }
    );
    console.log("Data in fetchFpIdentityDocument", response.data);
    return response.data;
  } catch (err) {
    console.error(
      "❌ [FP IDDOC] Fetch failed:",
      err.response?.data || err.message
    );
    throw new Error(
      err.response?.data?.message || "Failed to fetch identity document"
    );
  }
};
