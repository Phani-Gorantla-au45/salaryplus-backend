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

/* ------------------------------------------------------------------ */
/*  GET /v2/mf_folios                                                   */
/*                                                                      */
/*  Fetches all MF folios registered under the tenant.                  */
/*                                                                      */
/*  params: {                                                           */
/*    folio_number:         String  (optional)                          */
/*    mf_investment_account: String (optional — FP MFIA id)            */
/*  }                                                                   */
/*                                                                      */
/*  FP response: { object: "list", data: [...], ...pagination }        */
/* ------------------------------------------------------------------ */
export const fetchFpFolios = async (params = {}) => {
  try {
    console.log("\n📋 [FP FOLIOS] Fetching folios, params:", params);
    const response = await axios.get(`${FP_API_URL()}/v2/mf_folios`, {
      headers: await fpHeaders(),
      params,
    });
    console.log(
      `✅ [FP FOLIOS] Got ${response.data?.data?.length ?? "?"} folio(s)`
    );
    return response.data;
  } catch (err) {
    console.error(
      "❌ [FP FOLIOS] Fetch failed:",
      JSON.stringify(err.response?.data || err.message, null, 2)
    );
    throw new Error(
      err.response?.data?.message || "Failed to fetch folios from FP"
    );
  }
};
