import axios from "axios";
import { getFpToken } from "../fpToken.utils.js";

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
/*  GET /transactions                                                    */
/*                                                                      */
/*  Lists all transactions for given folio(s), sorted by date desc.    */
/*                                                                      */
/*  params: {                                                           */
/*    folios  — required, comma-separated folio numbers                */
/*    types   — optional, comma-separated transaction types            */
/*    from    — optional, yyyy-MM-dd                                   */
/*    to      — optional, yyyy-MM-dd                                   */
/*  }                                                                   */
/* ------------------------------------------------------------------ */
export const fetchFpTransactions = async (params) => {
  try {
    console.log(`\n📋 [FP TRANSACTIONS] Fetching transactions, params:`, params);
    const response = await axios.get(`${FP_API_URL()}/transactions`, {
      headers: await fpHeaders(),
      params,
    });
    console.log(
      `✅ [FP TRANSACTIONS] Received — count: ${response.data?.data?.length ?? response.data?.length ?? "?"}`
    );
    return response.data;
  } catch (err) {
    console.error(
      "❌ [FP TRANSACTIONS] Fetch failed:",
      JSON.stringify(err.response?.data || err.message, null, 2)
    );
    throw new Error(
      err.response?.data?.message || "Failed to fetch transactions from FP"
    );
  }
};
