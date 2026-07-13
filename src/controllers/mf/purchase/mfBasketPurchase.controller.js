import MfPurchase from "../../../models/mf/purchase/mfPurchase.model.js";
import MfUserData from "../../../models/mf/mfUserData.model.js";
import MfBasket from "../../../models/mf/mfBasket.model.js";
import User from "../../../models/user/user.model.js";
import GoalTemplate from "../../../models/goals/goalTemplate.model.js";
import UserGoal from "../../../models/goals/userGoal.model.js";
import { createFpBatchPurchase } from "../../../utils/mf/purchase/batchPurchase.utils.js";
import {
  generateOtp,
  otpExpiresAt,
  sendConsentOtp,
} from "../../../utils/mf/consent.utils.js";

/* ------------------------------------------------------------------ */
/*  Internal — auto-upsert goal and link folios after basket purchase   */
/* ------------------------------------------------------------------ */
const autoLinkGoal = async ({ uniqueId, basketId, folioNumbers }) => {
  const basket = await MfBasket.findById(basketId).lean();
  if (!basket?.goalType) return; // basket not tied to a goal, nothing to do

  const template = await GoalTemplate.findOne({ type: basket.goalType }).lean();
  if (!template) return; // no matching goal template

  // Upsert the goal — idempotent. basketId only goes in $set (always kept in
  // sync); having it in $setOnInsert too caused a Mongo path-conflict error
  // on every basket purchase since both operators targeted the same field.
  const goal = await UserGoal.findOneAndUpdate(
    { uniqueId, templateType: basket.goalType },
    {
      $setOnInsert: {
        templateId:   template._id,
        templateType: basket.goalType,
        uniqueId,
        inputs:       {},
        status:       "active",
      },
      $set: { basketId },
    },
    { upsert: true, new: true }
  );

  // Append new folio numbers without duplicates
  if (folioNumbers.length > 0) {
    await UserGoal.updateOne(
      { _id: goal._id },
      { $addToSet: { linkedFolioNumbers: { $each: folioNumbers } } }
    );
  }

  console.log(`✅ [GOAL LINK] Goal "${basket.goalType}" linked for user=${uniqueId}, folios added: [${folioNumbers.join(", ")}]`);
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/basket-purchase                                        */
/*  Creates N purchase orders via FP batch API (one per fund).         */
/*  FP returns N separate orders; we store them all in one MfPurchase  */
/*  record so the frontend gets a single purchaseId to work with.      */
/*                                                                      */
/*  After creation, use the returned purchaseId with:                   */
/*    POST /api/mf/purchase/:id/confirm  (handles basket orders too)   */
/*                                                                      */
/*  Body: {                                                             */
/*    mf_purchases: [{ isin: "INF...", amount: 1000 }, ...]            */
/*  }                                                                   */
/* ------------------------------------------------------------------ */
export const createBasketPurchase = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { mf_purchases, payment_method, basket_id } = req.body;
    console.log("body in create basket", req.body);
    /* ---------- VALIDATE ---------- */
    if (!Array.isArray(mf_purchases) || mf_purchases.length === 0) {
      return res.status(400).json({
        success: false,
        message: "mf_purchases must be a non-empty array of { isin, amount }",
      });
    }
    if (!payment_method || !["NETBANKING", "UPI"].includes(payment_method)) {
      return res.status(400).json({
        success: false,
        message: "payment_method is required. Allowed values: NETBANKING, UPI",
      });
    }
    for (const p of mf_purchases) {
      if (
        !p.isin ||
        !p.amount ||
        isNaN(Number(p.amount)) ||
        Number(p.amount) <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Each entry in mf_purchases must have an isin and a positive amount",
        });
      }
    }

    /* ---------- STEP 1: GET INVESTMENT ACCOUNT ---------- */
    console.log(
      `\n🗂️  [BASKET PURCHASE] user=${uniqueId} funds=${mf_purchases.length}`,
    );
    const mfData = await MfUserData.findOne({ uniqueId });
    const fpInvestmentAccountId =
      mfData?.investmentAccount?.fpInvestmentAccountId;
    if (!fpInvestmentAccountId) {
      return res.status(400).json({
        success: false,
        message:
          "MF investment account not found. Complete account setup first.",
      });
    }
    console.log(`  [1/4] ✅ investmentAccount=${fpInvestmentAccountId}`);

    /* ---------- STEP 2: CREATE FP BATCH PURCHASE ---------- */
    const rawIp =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      "127.0.0.1";
    const userIp = rawIp.startsWith("::ffff:")
      ? rawIp.slice(7)
      : rawIp === "::1"
        ? "127.0.0.1"
        : rawIp;

    const fpPayload = mf_purchases.map((p) => ({
      amount: Number(p.amount),
      mf_investment_account: fpInvestmentAccountId,
      scheme: p.isin.toUpperCase().trim(),
      gateway: "ondc",
      user_ip: userIp,
      ...(p.folio_number && { folio_number: p.folio_number }),
    }));

    console.log(
      `  [FOLIO] per-fund folios:`,
      mf_purchases.map((p) => `${p.isin}=${p.folio_number ?? "none"}`),
    );
    console.log(
      `  [2/4] Creating FP batch purchase (${fpPayload.length} orders)...`,
    );

    console.log("Basket order Payloand", fpPayload);
    // createFpBatchPurchase returns the data[] array directly
    // FP response: { object: "list", data: [ { id, old_id, scheme, state, ... }, ... ] }
    const fpOrders = await createFpBatchPurchase(fpPayload);

    if (!fpOrders.length) {
      throw new Error("FP returned no orders in batch response");
    }
    console.log(
      `  [2/4] ✅ ${fpOrders.length} FP orders — ids: ${fpOrders
        .map((o) => o.id)
        .join(", ")}`,
    );

    /* ---------- STEP 3: SEND CONSENT OTP ---------- */
    let phone = mfData?.phone?.number;
    let email = mfData?.email?.email;
    if (!phone || !email) {
      const user = await User.findOne({ uniqueId });
      if (!phone) phone = user?.phone;
      if (!email) email = user?.email;
    }
    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "No phone number found. Cannot send consent OTP.",
      });
    }
    const otp = generateOtp();
    const expiry = otpExpiresAt();
    console.log(
      `  [3/4] Sending OTP to ${phone.slice(0, 3)}****${phone.slice(-3)}...`,
    );
    await sendConsentOtp(phone, otp, email);
    console.log(`  [3/4] ✅ OTP sent`);

    /* ---------- STEP 4: SAVE AS SINGLE MfPurchase ---------- */
    // Store the primary FP order id as fpPurchaseId (used as unique DB key).
    // All N orders are embedded in basketOrders[].
    console.log("primary order", fpOrders);
    const primaryOrder = fpOrders[0];
    const totalAmount = mf_purchases.reduce((s, p) => s + Number(p.amount), 0);

    const basketOrders = fpOrders.map((o, i) => ({
      fpPurchaseId: o.id,
      fpOldId: o.old_id ?? null,
      isin: o.scheme ?? mf_purchases[i]?.isin?.toUpperCase() ?? null,
      amount: o.amount ?? Number(mf_purchases[i]?.amount),
      fpState: o.state ?? "created",
    }));

    console.log(`  [4/4] Saving to DB...`);
    const record = await MfPurchase.findOneAndUpdate(
      { fpPurchaseId: primaryOrder.id },
      {
        $set: {
          uniqueId,
          fpPurchaseId: primaryOrder.id,
          fpOldId: primaryOrder.old_id ?? null,
          mfInvestmentAccountId: fpInvestmentAccountId,
          amount: totalAmount,
          isBasketOrder: true,
          basketFunds: mf_purchases.map((p) => ({
            isin: p.isin.toUpperCase().trim(),
            amount: Number(p.amount),
            ...(p.folio_number && { folioNumber: p.folio_number }),
          })),
          basketOrders,
          fpOldIds: basketOrders.map((o) => o.fpOldId).filter(Boolean),
          paymentMethod: payment_method,
          fpState: primaryOrder.state ?? "created",
          otpCode: otp,
          otpExpiresAt: expiry,
          otpVerified: false,
        },
      },
      { upsert: true, new: true },
    );
    console.log(
      `  [4/4] ✅ purchaseId=${record._id} (${basketOrders.length} FP orders stored)`,
    );

    // Auto-link goal — fire and forget, never blocks the purchase response
    if (basket_id) {
      const folioNumbers = mf_purchases.map((p) => p.folio_number).filter(Boolean);
      autoLinkGoal({ uniqueId, basketId: basket_id, folioNumbers })
        .catch((err) => console.error("❌ [GOAL LINK] Error:", err.message));
    }

    return res.status(201).json({
      success: true,
      message: "Basket purchase created. OTP sent for consent.",
      data: {
        purchaseId: record._id, // use with POST /api/mf/purchase/:id/confirm
        fpPurchaseId: record.fpPurchaseId,
        totalAmount,
        funds: record.basketFunds,
        fpState: record.fpState,
        otpSentTo: `${phone.slice(0, 3)}****${phone.slice(-3)}`,
        otpExpiresAt: expiry,
      },
    });
  } catch (err) {
    console.error("❌ [BASKET PURCHASE] Create error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
