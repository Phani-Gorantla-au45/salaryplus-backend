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
/*  POST /v2/mf_purchases/batch                                         */
/*                                                                      */
/*  Creates multiple lumpsum purchase orders in a single FP call.       */
/*  Only available for gateway=ondc.                                    */
/*                                                                      */
/*  purchases: Array of {                                               */
/*    amount:                Number                                     */
/*    mf_investment_account: String   (FP MFIA id)                     */
/*    scheme:                String   (ISIN)                            */
/*    gateway:               "ondc"                                     */
/*  }                                                                   */
/*                                                                      */
/*  FP response: { object: "list", data: [ { id, old_id, state, ... }, ... ] } */
/* ------------------------------------------------------------------ */
export const createFpBatchPurchase = async (purchases) => {
  try {
    const payload = { mf_purchases: purchases };
    console.log(
      `\n📤 [FP BATCH] Creating ${purchases.length} order(s):`,
      JSON.stringify(payload, null, 2)
    );
    const response = await axios.post(
      `${FP_API_URL()}/v2/mf_purchases/batch`,
      payload,
      { headers: await fpHeaders() }
    );
    // FP returns { object: "list", data: [ { id, old_id, ... }, ... ] }
    // Each fund in the batch gets its own separate purchase order
    console.log("basket order resp", response.data);
    const orders = response.data?.data ?? [];
    console.log(
      `✅ [FP BATCH] Created ${orders.length} order(s) — ids: ${orders
        .map((o) => o.id)
        .join(", ")}`
    );
    return orders; // return the array directly
  } catch (err) {
    console.error(
      "❌ [FP BATCH] Create failed:",
      JSON.stringify(err.response?.data || err.message, null, 2)
    );
    throw new Error(
      err.response?.data?.message || "Failed to create batch purchase on FP"
    );
  }
};
