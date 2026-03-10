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
/*  POST /v2/transactions/reports/investment_account_wise_returns       */
/*                                                                      */
/*  Returns investment snapshot: invested amount, current value,        */
/*  unrealized gain, absolute return, CAGR, XIRR.                      */
/*                                                                      */
/*  payload: {                                                          */
/*    mf_investment_account: String  (FP MFIA string id)               */
/*    traded_on_to:          String  (yyyy-MM-dd, current IST date)    */
/*  }                                                                   */
/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/*  POST /v2/transactions/reports/scheme_wise_returns                   */
/*                                                                      */
/*  Returns scheme-level breakdown: ISIN, scheme name, plan type,      */
/*  nav, invested amount, current value, units, XIRR per scheme.       */
/*                                                                      */
/*  payload: {                                                          */
/*    mf_investment_account: String  (FP MFIA string id)               */
/*    traded_on_to:          String  (yyyy-MM-dd, current IST date)    */
/*  }                                                                   */
/* ------------------------------------------------------------------ */
export const fetchFpSchemeReturns = async (mfInvestmentAccountId, tradedOnTo) => {
  try {
    const payload = {
      mf_investment_account: mfInvestmentAccountId,
      traded_on_to: tradedOnTo,
    };
    console.log(
      `\n📊 [FP SCHEME RETURNS] Fetching for account=${mfInvestmentAccountId} as_on=${tradedOnTo}`
    );
    const response = await axios.post(
      `${FP_API_URL()}/v2/transactions/reports/scheme_wise_returns`,
      payload,
      { headers: await fpHeaders() }
    );
    console.log(`✅ [FP SCHEME RETURNS] Received data`);
    return response.data;
  } catch (err) {
    console.error(
      "❌ [FP SCHEME RETURNS] Fetch failed:",
      JSON.stringify(err.response?.data || err.message, null, 2)
    );
    throw new Error(
      err.response?.data?.message || "Failed to fetch scheme returns from FP"
    );
  }
};

export const fetchFpInvestmentReturns = async (mfInvestmentAccountId, tradedOnTo) => {
  try {
    const payload = {
      mf_investment_account: mfInvestmentAccountId,
      traded_on_to: tradedOnTo,
    };
    console.log(
      `\n📊 [FP RETURNS] Fetching investment returns for account=${mfInvestmentAccountId} as_on=${tradedOnTo}`
    );
    const response = await axios.post(
      `${FP_API_URL()}/v2/transactions/reports/investment_account_wise_returns`,
      payload,
      { headers: await fpHeaders() }
    );
    console.log(`✅ [FP RETURNS] Received returns data`);
    return response.data;
  } catch (err) {
    console.error(
      "❌ [FP RETURNS] Fetch failed:",
      JSON.stringify(err.response?.data || err.message, null, 2)
    );
    throw new Error(
      err.response?.data?.message || "Failed to fetch investment returns from FP"
    );
  }
};
