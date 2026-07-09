import MfSip from "../../../models/mf/sip/mfSip.model.js";
import MfUserData from "../../../models/mf/mfUserData.model.js";
import {
  listFpPurchasesByPlan,
  createFpPaymentNetbanking,
  fetchFpPayment,
} from "../../../utils/mf/purchase/purchase.utils.js";

/* ------------------------------------------------------------------ */
/*  Internal — collect all FP plan IDs for a SIP (single or basket)    */
/* ------------------------------------------------------------------ */
const getPlanIds = (sip) => {
  if (sip.isBasketSip) {
    return sip.basketPlans
      .filter((p) => p.fpSipId)
      .map((p) => p.fpSipId);
  }
  return sip.fpSipId ? [sip.fpSipId] : [];
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/sip/:sipId/first-installment                          */
/*  Fetches the pending first-installment purchase orders linked to     */
/*  the SIP plan(s) and initiates netbanking payment for all of them   */
/*  in a single payment call (single and basket both handled).         */
/*                                                                     */
/*  Body: { bank_account_id, payment_method, payment_postback_url }   */
/*    bank_account_id      – numeric fpBankAccountOldId                */
/*    payment_method       – "NETBANKING" | "UPI"                      */
/*    payment_postback_url – frontend redirect URL after payment       */
/* ------------------------------------------------------------------ */
export const payFirstInstallment = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { sipId } = req.params;
    const { bank_account_id, payment_method, payment_postback_url } = req.body;

    if (!bank_account_id || isNaN(Number(bank_account_id))) {
      return res.status(400).json({
        success: false,
        message: "bank_account_id is required (numeric FP bank old_id from GET /api/mf/bank-account → fpBankAccountOldId)",
      });
    }

    if (!payment_method || !["NETBANKING", "UPI"].includes(payment_method)) {
      return res.status(400).json({
        success: false,
        message: "payment_method is required. Allowed values: NETBANKING, UPI",
      });
    }

    /* ---------- LOAD SIP ---------- */
    const sip = await MfSip.findOne({ _id: sipId, uniqueId });
    if (!sip) {
      return res.status(404).json({ success: false, message: "SIP not found" });
    }

    const planIds = getPlanIds(sip);
    if (planIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "SIP has no FP plan IDs — cannot initiate first installment payment",
      });
    }

    /* ---------- FETCH FIRST-INSTALLMENT PURCHASES FROM FP ---------- */
    const amcOrderIds = [];

    for (const planId of planIds) {
      const purchases = await listFpPurchasesByPlan(planId);
      const pending = purchases.filter((p) => p.state === "pending");

      if (pending.length === 0) {
        console.warn(`⚠️  [SIP FIRST INSTALL] No pending purchase for plan ${planId}`);
        continue;
      }

      const oldId = pending[0].old_id;
      if (!oldId) {
        return res.status(502).json({
          success: false,
          message: `FP purchase for plan ${planId} is missing old_id`,
        });
      }

      amcOrderIds.push(oldId);
    }

    if (amcOrderIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No pending first-installment purchases found. Payment may have already been initiated or the SIP is not yet active.",
      });
    }

    console.log(`📋 [SIP FIRST INSTALL] sipId=${sipId} planIds=${planIds.join(",")} amcOrderIds=${amcOrderIds.join(",")}`);

    /* ---------- GET BANK OLD_ID ---------- */
    const mfData = await MfUserData.findOne({ uniqueId });
    const postbackUrl = payment_postback_url
      || `${process.env.APP_URL}/api/mf/purchase/payment-callback`;

    /* ---------- CREATE PAYMENT ---------- */
    const paymentPayload = {
      amc_order_ids:       amcOrderIds,
      method:              payment_method,
      payment_postback_url: postbackUrl,
      bank_account_id:     Number(bank_account_id),
    };

    const fpPayment = await createFpPaymentNetbanking(paymentPayload);

    /* ---------- STORE PAYMENT ID IN SIP ---------- */
    await MfSip.findByIdAndUpdate(sipId, {
      $set: { fpFirstInstallmentPaymentId: fpPayment.id },
    });

    console.log(`✅ [SIP FIRST INSTALL] Payment created — fpPaymentId=${fpPayment.id}`);

    return res.status(200).json({
      success: true,
      message: "First installment payment initiated",
      data: {
        fpPaymentId:   fpPayment.id,
        payment_url:   fpPayment.token_url,
        amc_order_ids: amcOrderIds,
      },
    });
  } catch (err) {
    console.error("❌ [SIP FIRST INSTALL] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/sip/:sipId/first-installment/status                    */
/*  Polls payment status for the first installment.                    */
/*  Frontend calls this after user returns from payment URL.           */
/* ------------------------------------------------------------------ */
export const getFirstInstallmentStatus = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { sipId } = req.params;

    const sip = await MfSip.findOne({ _id: sipId, uniqueId });
    if (!sip) {
      return res.status(404).json({ success: false, message: "SIP not found" });
    }

    if (!sip.fpFirstInstallmentPaymentId) {
      return res.status(404).json({
        success: false,
        message: "No first installment payment found for this SIP. Initiate via POST /api/mf/sip/:sipId/first-installment",
      });
    }

    const fpPayment = await fetchFpPayment(sip.fpFirstInstallmentPaymentId);

    return res.status(200).json({
      success: true,
      data: {
        fpPaymentId: fpPayment.id,
        status:      fpPayment.status,        // PENDING | SUCCESS | FAILED
        amount:      fpPayment.amount ?? null,
        updatedAt:   fpPayment.updated_at ?? null,
      },
    });
  } catch (err) {
    console.error("❌ [SIP FIRST INSTALL STATUS] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
