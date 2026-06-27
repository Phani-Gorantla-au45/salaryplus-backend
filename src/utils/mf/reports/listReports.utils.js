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
/*  POST /v2/transactions/reports/transaction_list                      */
/*                                                                      */
/*  Lists RTA-processed transactions matching the given filters         */
/*  (purchases, redemptions, SIP installments, corporate actions).     */
/*                                                                      */
/*  payload: {                                                          */
/*    partner?:               String                                   */
/*    traded_on_from?:        String (yyyy-MM-dd — default: last 2000) */
/*    traded_on_to?:          String (yyyy-MM-dd — default: today)     */
/*    primary_investor_name?: String (substring match)                 */
/*    folio_number?:          String (exact match)                     */
/*    pan_number?:            String (exact match)                     */
/*  }                                                                   */
/* ------------------------------------------------------------------ */
export const fetchFpTransactionListReport = async (payload = {}) => {
  try {
    console.log(`\n📋 [FP TXN LIST REPORT] Fetching with filters:`, payload);
    const response = await axios.post(
      `${FP_API_URL()}/v2/transactions/reports/transaction_list`,
      payload,
      { headers: await fpHeaders() },
    );
    console.log(`✅ [FP TXN LIST REPORT] Received ${response.data?.data?.rows?.length ?? 0} row(s)`);
    return response.data;
  } catch (err) {
    console.error(
      "❌ [FP TXN LIST REPORT] Fetch failed:",
      JSON.stringify(err.response?.data || err.message, null, 2),
    );
    throw new Error(err.response?.data?.message || "Failed to fetch transaction list report from FP");
  }
};

/* ------------------------------------------------------------------ */
/*  POST /v2/mf_purchases/reports/mf_purchase_list                      */
/*                                                                      */
/*  payload: {                                                          */
/*    ids?:           String[]                                         */
/*    states?:        String[] (pending/confirmed/submitted/successful/ */
/*                     failed/cancelled/refunded/reversed)              */
/*    plans?:         String[] (mf purchase plan ids)                  */
/*    plan_old_ids?:  String[]                                          */
/*  }                                                                   */
/* ------------------------------------------------------------------ */
export const fetchFpPurchaseListReport = async (payload = {}) => {
  try {
    console.log(`\n📋 [FP PURCHASE LIST REPORT] Fetching with filters:`, payload);
    const response = await axios.post(
      `${FP_API_URL()}/v2/mf_purchases/reports/mf_purchase_list`,
      payload,
      { headers: await fpHeaders() },
    );
    console.log(`✅ [FP PURCHASE LIST REPORT] Received ${response.data?.data?.rows?.length ?? 0} row(s)`);
    return response.data;
  } catch (err) {
    console.error(
      "❌ [FP PURCHASE LIST REPORT] Fetch failed:",
      JSON.stringify(err.response?.data || err.message, null, 2),
    );
    throw new Error(err.response?.data?.message || "Failed to fetch purchase list report from FP");
  }
};

/* ------------------------------------------------------------------ */
/*  POST /v2/mf_redemptions/reports/mf_redemption_list                  */
/*                                                                      */
/*  payload: {                                                          */
/*    ids?:           String[]                                         */
/*    states?:        String[]                                         */
/*    plans?:         String[] (mf redemption plan ids)                */
/*    plan_old_ids?:  String[]                                          */
/*  }                                                                   */
/* ------------------------------------------------------------------ */
export const fetchFpRedemptionListReport = async (payload = {}) => {
  try {
    console.log(`\n📋 [FP REDEMPTION LIST REPORT] Fetching with filters:`, payload);
    const response = await axios.post(
      `${FP_API_URL()}/v2/mf_redemptions/reports/mf_redemption_list`,
      payload,
      { headers: await fpHeaders() },
    );
    console.log(`✅ [FP REDEMPTION LIST REPORT] Received ${response.data?.data?.rows?.length ?? 0} row(s)`);
    return response.data;
  } catch (err) {
    console.error(
      "❌ [FP REDEMPTION LIST REPORT] Fetch failed:",
      JSON.stringify(err.response?.data || err.message, null, 2),
    );
    throw new Error(err.response?.data?.message || "Failed to fetch redemption list report from FP");
  }
};
