import axios from "axios";
import FormData from "form-data";
import { getFpToken } from "./fpToken.utils.js";

const FP_FILES_URL = () => `${process.env.FP_API_URL}/files`;
const FP_TENANT_ID = () => process.env.FP_TENANT_ID;

/* ------------------------------------------------------------------ */
/*  Upload a file to FintechPrimitives                                  */
/*  Used for: signature image / sign-pad PNG                           */
/* ------------------------------------------------------------------ */
export const uploadFpFile = async ({ buffer, originalname, mimetype, purpose }) => {
  const token = await getFpToken();

  const form = new FormData();
  form.append("file", buffer, { filename: originalname, contentType: mimetype });
  if (purpose) form.append("purpose", purpose);

  try {
    const response = await axios.post(FP_FILES_URL(), form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${token}`,
        "x-tenant-id": FP_TENANT_ID(),
      },
    });
    console.log(`✅ [FP FILE] Uploaded — id: ${response.data?.id}`);
    return response.data;
  } catch (err) {
    console.error("❌ [FP FILE] Upload failed:", err.response?.data || err.message);
    throw new Error(err.response?.data?.message || "Failed to upload file to FP");
  }
};

/* ------------------------------------------------------------------ */
/*  Fetch file metadata from FintechPrimitives                          */
/* ------------------------------------------------------------------ */
export const fetchFpFile = async (fileId) => {
  const token = await getFpToken();
  try {
    const response = await axios.get(`${FP_FILES_URL()}/${fileId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-tenant-id": FP_TENANT_ID(),
      },
    });
    return response.data;
  } catch (err) {
    console.error("❌ [FP FILE] Fetch failed:", err.response?.data || err.message);
    throw new Error(err.response?.data?.message || "Failed to fetch file from FP");
  }
};
