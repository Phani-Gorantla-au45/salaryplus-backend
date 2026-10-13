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
    console.log(`[FP TXN LIST REPORT] Received ${response.data?.data?.rows?.length ?? 0} row(s)`);
    return response.data;
  } catch (err) {
    console.error(
      "❌ [FP TXN LIST REPORT] Fetch failed:",
      JSON.stringify(err.response?.data || err.message, null, 2),
    );
    throw new Error(
      err.response?.data?.message ||
        "Failed to fetch transaction list report from FP",
    );
  }
};

/* ------------------------------------------------------------------ */
/*  GET /v2/mf_purchases  — fetches ALL pages via cursor pagination.   */
/*                                                                      */
/*  params: {                                                           */
/*    mf_investment_account?: String                                   */
/*    states?:                String  (comma-separated)                */
/*    plan?:                  String  (mf purchase plan id)            */
/*    skip_instruction?:      String                                   */
/*  }                                                                   */
/* ------------------------------------------------------------------ */
export const fetchFpPurchases = async (params = {}) => {
  try {
    const allData = [];
    let cursor = null;
    let pageNum = 0;

    do {
      pageNum++;
      const pageParams = { ...params, ...(cursor ? { after: cursor } : {}) };
      const response = await axios.get(`${FP_API_URL()}/v2/mf_purchases`, {
        params: pageParams,
        headers: await fpHeaders(),
      });
      const page = response.data;

      // Log full response shape on first page so we can verify pagination keys
      if (pageNum === 1) {
        const shape = Object.fromEntries(
          Object.entries(page).map(([k, v]) => [k, Array.isArray(v) ? `Array(${v.length})` : v])
        );
        console.log(`[FP PURCHASES] Page 1 response shape:`, JSON.stringify(shape));
      }

      const records = page?.data ?? [];
      allData.push(...records);
      cursor = page?.next ?? null;
      console.log(`[FP PURCHASES] Page ${pageNum}: ${records.length} records, next=${cursor}`);
    } while (cursor);

    console.log(`[FP PURCHASES] Done — total: ${allData.length} records across ${pageNum} page(s)`);
    return { object: "list", data: allData };
  } catch (err) {
    console.error(`[FP PURCHASES] Fetch failed:`, err.response?.data || err.message);
    throw new Error(err.response?.data?.message || "Failed to fetch purchases from FP");
  }
};

/* ------------------------------------------------------------------ */
/*  POST /v2/mf_purchases/reports/mf_purchase_list  (admin bulk report) */
/*                                                                      */
/*  payload: {                                                          */
/*    ids?:          String[]                                          */
/*    states?:       String[]                                          */
/*    plans?:        String[]                                          */
/*    plan_old_ids?: String[]                                          */
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
    throw new Error(
      err.response?.data?.message ||
        "Failed to fetch purchase list report from FP",
    );
  }
};

/* ------------------------------------------------------------------ */
/*  GET /v2/mf_redemptions                                              */
/*                                                                      */
/*  params: {                                                           */
/*    mf_investment_account?: String                                   */
/*    states?:                String  (comma-separated)                */
/*    plan?:                  String  (mf redemption plan id)          */
/*  }                                                                   */
/* ------------------------------------------------------------------ */
export const fetchFpRedemptions = async (params = {}) => {
  try {
    console.log(`\n📋 [FP REDEMPTIONS] Fetching all pages with params:`, params);
    const allData = [];
    let cursor = null;

    do {
      const pageParams = { ...params, ...(cursor ? { after: cursor } : {}) };
      const response = await axios.get(`${FP_API_URL()}/v2/mf_redemptions`, {
        params: pageParams,
        headers: await fpHeaders(),
      });
      const page = response.data;
      allData.push(...(page?.data ?? []));
      cursor = page?.next ?? null;
      console.log(`✅ [FP REDEMPTIONS] Page received: ${page?.data?.length ?? 0} record(s), next=${cursor}`);
    } while (cursor);

    console.log(`✅ [FP REDEMPTIONS] Total fetched: ${allData.length} record(s)`);
    return { object: "list", data: allData };
  } catch (err) {
    console.error(
      "❌ [FP REDEMPTIONS] Fetch failed:",
      JSON.stringify(err.response?.data || err.message, null, 2),
    );
    throw new Error(
      err.response?.data?.message || "Failed to fetch redemptions from FP",
    );
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
    console.log(
      `\n📋 [FP REDEMPTION LIST REPORT] Fetching with filters:`,
      payload,
    );
    const response = await axios.post(
      `${FP_API_URL()}/v2/mf_redemptions/reports/mf_redemption_list`,
      payload,
      { headers: await fpHeaders() },
    );
    console.log(
      `✅ [FP REDEMPTION LIST REPORT] Received ${response.data?.data?.rows?.length ?? 0} row(s)`,
    );
    return response.data;
  } catch (err) {
    console.error(
      "❌ [FP REDEMPTION LIST REPORT] Fetch failed:",
      JSON.stringify(err.response?.data || err.message, null, 2),
    );
    throw new Error(
      err.response?.data?.message ||
        "Failed to fetch redemption list report from FP",
    );
  }
};
