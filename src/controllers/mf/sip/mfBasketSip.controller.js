import MfSip from "../../../models/mf/sip/mfSip.model.js";
import MfUserData from "../../../models/mf/mfUserData.model.js";
import MfSchemePlan from "../../../models/mf/master/mfSchemePlan.model.js";
import User from "../../../models/user/user.model.js";
import UserGoal from "../../../models/goals/userGoal.model.js";
import {
  createFpBatchSip,
  patchFpBatchSip,
  fetchFpSip,
} from "../../../utils/mf/sip/sip.utils.js";
import { fetchFpSchemePlan } from "../../../utils/mf/master/schemePlan.utils.js";
import {
  generateOtp,
  otpExpiresAt,
  sendConsentOtp,
  verifyConsentOtp,
} from "../../../utils/mf/consent.utils.js";
import { sipPublicResponse } from "./mfSip.controller.js";

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                     */
/* ------------------------------------------------------------------ */
const resolveScheme = async (isin) => {
  const upper = isin?.toUpperCase().trim();
  let scheme = await MfSchemePlan.findOne({ isin: upper });
  if (!scheme?.syncedAt) {
    const fpData = await fetchFpSchemePlan(upper);
    scheme = await MfSchemePlan.findOneAndUpdate(
      { isin: upper },
      {
        $set: {
          isin: fpData.isin?.toUpperCase() || upper,
          schemeName: fpData.mf_scheme?.name ?? null,
          fundName: fpData.mf_fund?.name ?? null,
          type: fpData.type,
          option: fpData.option,
          active: fpData.active ?? true,
          thresholds: fpData.thresholds ?? [],
          syncedAt: new Date(),
        },
      },
      { upsert: true, new: true },
    );
  }
  if (!scheme) throw new Error(`Scheme not found for ISIN: ${upper}`);
  return scheme;
};

const resolveUserIp = (req) => {
  const raw =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "127.0.0.1";
  if (raw.startsWith("::ffff:")) return raw.slice(7);
  if (raw === "::1") return "127.0.0.1";
  return raw;
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/basket-sip                                             */
/*  Step 1: Create basket SIP plans on FP + send consent OTP.          */
/*                                                                      */
/*  Body: {                                                             */
/*    frequency,                 "daily" | "monthly"                   */
/*    installment_day?,          required for monthly (1–28)            */
/*    payment_source,            FP mandate numeric id                  */
/*    number_of_installments?,   default 120                            */
/*    generate_first_installment_now?,                                  */
/*    sip_plans: [{ isin, amount }]   min 2 funds                       */
/*  }                                                                   */
/* ------------------------------------------------------------------ */
export const createBasketSip = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const {
      frequency,
      installment_day,
      payment_source,
      years = 20,
      generate_first_installment_now = false,
      sip_plans,
      goal_id,
      folio_number,
    } = req.body;

    const number_of_installments =
      frequency === "daily" ? Number(years) * 365 : Number(years) * 12;

    /* ---------- VALIDATE ---------- */
    if (!frequency || !["daily", "monthly"].includes(frequency)) {
      return res.status(400).json({
        success: false,
        message: "frequency must be daily or monthly",
      });
    }
    if (
      frequency === "monthly" &&
      (!installment_day || installment_day < 1 || installment_day > 28)
    ) {
      return res.status(400).json({
        success: false,
        message: "installment_day (1-28) is required for monthly SIP",
      });
    }
    if (!payment_source) {
      return res.status(400).json({
        success: false,
        message: "payment_source (mandate id) is required",
      });
    }
    if (!Array.isArray(sip_plans) || sip_plans.length < 2) {
      return res.status(400).json({
        success: false,
        message: "sip_plans must be an array of at least 2 funds",
      });
    }
    for (const plan of sip_plans) {
      if (
        !plan.isin ||
        !plan.amount ||
        isNaN(Number(plan.amount)) ||
        Number(plan.amount) <= 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Each sip_plan must have a valid isin and amount",
        });
      }
    }

    /* ---------- STEP 1: GET INVESTMENT ACCOUNT ---------- */
    console.log(
      `\n📋 [CREATE BASKET SIP] user=${uniqueId} freq=${frequency} plans=${sip_plans.length}`,
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

    /* ---------- STEP 2: RESOLVE SCHEMES ---------- */
    const schemes = await Promise.all(
      sip_plans.map((p) => resolveScheme(p.isin)),
    );
    for (const scheme of schemes) {
      if (!scheme.active) {
        return res.status(400).json({
          success: false,
          message: `Scheme ${scheme.isin} is currently inactive`,
        });
      }
    }
    console.log(`  [2/4] ✅ schemes: ${schemes.map((s) => s.isin).join(", ")}`);

    /* ---------- STEP 3: CREATE FP BATCH SIP ---------- */
    const userIp = resolveUserIp(req);
    const fpPlans = schemes.map((scheme, i) => ({
      mf_investment_account: fpInvestmentAccountId,
      scheme: scheme.isin,
      frequency,
      amount: Number(sip_plans[i].amount),
      number_of_installments: Number(number_of_installments),
      systematic: true,
      payment_method: "mandate",
      payment_source: String(payment_source),
      auto_generate_installments: true,
      initiated_by: "investor",
      initiated_via: "mobile_app",
      // gateway:                        "ondc",
      user_ip: userIp,
      generate_first_installment_now: Boolean(generate_first_installment_now),
      ...(frequency === "monthly" && {
        installment_day: Number(installment_day),
      }),
      ...(folio_number && { folio_number }),
    }));

    const fpResults = await createFpBatchSip(fpPlans);
    const primaryFpSipId = fpResults[0]?.id;
    const basketPlans = fpResults.map((fp, i) => ({
      fpSipId: fp.id,
      isin: schemes[i].isin,
      amount: Number(sip_plans[i].amount),
      fpState: fp.state ?? "created",
    }));
    const totalAmount = sip_plans.reduce((sum, p) => sum + Number(p.amount), 0);
    console.log(`  [3/4] ✅ batch SIP created — ${fpResults.length} plans`);

    /* ---------- STEP 4: SEND CONSENT OTP ---------- */
    let phone = mfData?.phone?.number;
    if (!phone) {
      const user = await User.findOne({ uniqueId });
      phone = user?.phone;
    }
    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "No phone number found. Cannot send consent OTP.",
      });
    }
    const otp = generateOtp();
    const expiry = otpExpiresAt();
    await sendConsentOtp(phone, otp);
    console.log(
      `  [4/4] ✅ OTP sent to ${phone.slice(0, 3)}****${phone.slice(-3)}`,
    );

    /* ---------- SAVE TO DB ---------- */
    const record = await MfSip.findOneAndUpdate(
      { fpSipId: primaryFpSipId },
      {
        $set: {
          uniqueId,
          fpSipId: primaryFpSipId,
          isBasketSip: true,
          basketFunds: sip_plans.map((p) => ({
            isin: p.isin.toUpperCase().trim(),
            amount: Number(p.amount),
          })),
          basketPlans,
          mfInvestmentAccountId: fpInvestmentAccountId,
          frequency,
          amount: totalAmount,
          installmentDay:
            frequency === "monthly" ? Number(installment_day) : null,
          numberOfInstallments: Number(number_of_installments),
          systematic: true,
          folioNumber: folio_number ?? null,
          generateFirstInstallmentNow: Boolean(generate_first_installment_now),
          paymentMethod: "mandate",
          paymentSource: String(payment_source),
          fpState: fpResults[0]?.state ?? "created",
          otpCode: otp,
          otpExpiresAt: expiry,
          otpVerified: false,
          linkedGoalId: goal_id ?? null,
        },
      },
      { upsert: true, new: true },
    );

    // Link goal → SIP if goal_id provided
    if (goal_id) {
      await UserGoal.updateOne(
        { _id: goal_id, uniqueId },
        { $set: { linkedSipId: record._id.toString() } },
      );
      console.log(`  ✅ Linked basket SIP ${record._id} → goal ${goal_id}`);
    }

    return res.status(201).json({
      success: true,
      message: `Basket SIP created (${fpResults.length} plans). OTP sent. Call POST /api/mf/basket-sip/:id/confirm with OTP.`,
      data: {
        sipId: record._id,
        totalAmount: record.amount,
        frequency: record.frequency,
        basketPlans: record.basketPlans,
        fpState: record.fpState,
        otpSentTo: `${phone.slice(0, 3)}****${phone.slice(-3)}`,
        otpExpiresAt: expiry,
      },
    });
  } catch (err) {
    console.error("❌ [CREATE BASKET SIP] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/basket-sip/:id/confirm                                 */
/*  Step 2: Verify OTP → PATCH consent + state=confirmed for all plans. */
/*                                                                      */
/*  Body: { otp }                                                       */
/*  :id = our DB _id                                                    */
/* ------------------------------------------------------------------ */
export const confirmBasketSip = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { id } = req.params;
    const { otp } = req.body;

    if (!otp)
      return res
        .status(400)
        .json({ success: false, message: "otp is required" });

    /* ---------- FETCH RECORD ---------- */
    const record = await MfSip.findOne({
      _id: id,
      uniqueId,
      isBasketSip: true,
    }).select("+otpCode");
    if (!record)
      return res
        .status(404)
        .json({ success: false, message: "Basket SIP not found" });
    if (record.consentGiven) {
      return res.status(400).json({
        success: false,
        message: "Consent already given for this basket SIP",
      });
    }

    /* ---------- VERIFY OTP ---------- */
    const { valid, reason } = verifyConsentOtp(
      otp,
      record.otpCode,
      record.otpExpiresAt,
    );
    if (!valid)
      return res.status(400).json({ success: false, message: reason });

    /* ---------- CHECK FP STATE FOR EACH PLAN ---------- */
    console.log(
      `\n✅ [CONFIRM BASKET SIP] sipId=${id} — checking ${record.basketPlans.length} plan states...`,
    );
    const planFetches = await Promise.allSettled(
      record.basketPlans.map((p) => fetchFpSip(p.fpSipId)),
    );
    const statesMap = {};
    for (let i = 0; i < planFetches.length; i++) {
      const plan = record.basketPlans[i];
      const result = planFetches[i];
      statesMap[plan.fpSipId] =
        result.status === "fulfilled" ? result.value.state : "created";
    }
    console.log(`  Plan states: ${JSON.stringify(statesMap)}`);

    const hasFailed = Object.values(statesMap).some((s) => s === "failed");
    const allReady = Object.values(statesMap).every(
      (s) => s === "review_completed",
    );

    if (hasFailed) {
      return res.status(400).json({
        success: false,
        message:
          "One or more SIP plans failed during FP review. Please create a new basket SIP.",
        planStates: statesMap,
      });
    }
    if (!allReady) {
      await MfSip.updateOne(
        { _id: record._id },
        { $set: { otpVerified: true, otpCode: null } },
      );
      return res.status(202).json({
        success: false,
        message:
          "OTP verified. Some SIP plans are still under FP review. Please retry confirm in a few seconds.",
        fpState: "created",
        planStates: statesMap,
      });
    }

    /* ---------- GET USER DETAILS FOR CONSENT ---------- */
    const mfData = await MfUserData.findOne({ uniqueId });
    let phone = mfData?.phone?.number;
    let email = mfData?.email?.email;
    if (!phone || !email) {
      const user = await User.findOne({ uniqueId });
      if (!phone) phone = user?.phone;
      if (!email) email = user?.email;
    }
    if (!phone || !email) {
      return res.status(400).json({
        success: false,
        message: "Phone and email are required for consent",
      });
    }
    const isd = mfData?.phone?.isd || "91";

    /* ---------- BATCH PATCH — CONFIRMED ---------- */
    console.log(
      `  Patching ${record.basketPlans.length} plans to confirmed...`,
    );
    const patchPayload = record.basketPlans.map((p) => ({
      id: p.fpSipId,
      state: "confirmed",
      consent: { email, isd_code: isd, mobile: phone },
    }));
    const confirmResults = await patchFpBatchSip(patchPayload);
    console.log(
      `  ✅ states after confirm: ${confirmResults
        .map((p) => p.state)
        .join(", ")}`,
    );

    /* ---------- BUILD UPDATED BASKET PLANS ---------- */
    const updatedBasketPlans = record.basketPlans.map((plan, i) => ({
      fpSipId: plan.fpSipId,
      isin: plan.isin,
      amount: plan.amount,
      fpState: confirmResults[i]?.state ?? plan.fpState,
    }));

    /* ---------- SAVE TO DB ---------- */
    const updated = await MfSip.findOneAndUpdate(
      { _id: record._id },
      {
        $set: {
          otpVerified: true,
          consentGiven: true,
          consentAt: new Date(),
          otpCode: null,
          fpState: confirmResults[0]?.state ?? "confirmed",
          basketPlans: updatedBasketPlans,
        },
      },
      { new: true },
    );

    return res.status(200).json({
      success: true,
      message: "Basket SIP confirmed successfully.",
      data: sipPublicResponse(updated),
    });
  } catch (err) {
    console.error("❌ [CONFIRM BASKET SIP] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/basket-sip/:id/resend-otp                              */
/* ------------------------------------------------------------------ */
export const resendBasketSipOtp = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { id } = req.params;

    const record = await MfSip.findOne({
      _id: id,
      uniqueId,
      isBasketSip: true,
    });
    if (!record)
      return res
        .status(404)
        .json({ success: false, message: "Basket SIP not found" });
    if (record.consentGiven) {
      return res
        .status(400)
        .json({ success: false, message: "Consent already given" });
    }

    const mfData = await MfUserData.findOne({ uniqueId });
    let phone = mfData?.phone?.number;
    if (!phone) {
      const user = await User.findOne({ uniqueId });
      phone = user?.phone;
    }
    if (!phone)
      return res
        .status(400)
        .json({ success: false, message: "No phone number found" });

    const otp = generateOtp();
    const expiry = otpExpiresAt();
    await sendConsentOtp(phone, otp);
    await MfSip.updateOne(
      { _id: record._id },
      { $set: { otpCode: otp, otpExpiresAt: expiry, otpVerified: false } },
    );

    return res.status(200).json({
      success: true,
      message: "OTP resent successfully",
      otpExpiresAt: expiry,
    });
  } catch (err) {
    console.error("❌ [BASKET SIP] Resend OTP error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/basket-sip/:id                                          */
/*  Get single basket SIP — refreshes each plan's state from FP.       */
/* ------------------------------------------------------------------ */
export const getBasketSip = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { id } = req.params;

    const record = await MfSip.findOne({
      _id: id,
      uniqueId,
      isBasketSip: true,
    });
    if (!record)
      return res
        .status(404)
        .json({ success: false, message: "Basket SIP not found" });

    try {
      const planFetches = await Promise.allSettled(
        record.basketPlans.map((p) => fetchFpSip(p.fpSipId)),
      );
      const updatedBasketPlans = record.basketPlans.map((plan, i) => {
        const result = planFetches[i];
        return {
          fpSipId: plan.fpSipId,
          isin: plan.isin,
          amount: plan.amount,
          fpState:
            result.status === "fulfilled" ? result.value.state : plan.fpState,
        };
      });
      const overallState = updatedBasketPlans[0]?.fpState ?? record.fpState;
      await MfSip.updateOne(
        { _id: record._id },
        { $set: { basketPlans: updatedBasketPlans, fpState: overallState } },
      );
    } catch {
      console.warn(
        `⚠️  [BASKET SIP] FP refresh failed for ${record._id}, returning cached`,
      );
    }

    const updated = await MfSip.findById(record._id);
    return res
      .status(200)
      .json({ success: true, data: sipPublicResponse(updated) });
  } catch (err) {
    console.error("❌ [BASKET SIP] Get error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/basket-sip                                              */
/*  List all basket SIPs for the authenticated user.                   */
/*  Query: ?state=active&frequency=monthly                              */
/* ------------------------------------------------------------------ */
export const listBasketSips = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { state, frequency } = req.query;

    const filter = { uniqueId, isBasketSip: true };
    if (state) filter.fpState = state;
    if (frequency) filter.frequency = frequency;

    const sips = await MfSip.find(filter).sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      count: sips.length,
      data: sips.map(sipPublicResponse),
    });
  } catch (err) {
    console.error("❌ [BASKET SIP] List error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/basket-sip/:id/cancel                                  */
/*  Cancels all plans in the basket SIP via batch PATCH.               */
/* ------------------------------------------------------------------ */
export const cancelBasketSip = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { id } = req.params;

    const record = await MfSip.findOne({
      _id: id,
      uniqueId,
      isBasketSip: true,
    });
    if (!record)
      return res
        .status(404)
        .json({ success: false, message: "Basket SIP not found" });
    if (
      ![
        "created",
        "review_completed",
        "confirmed",
        "submitted",
        "active",
      ].includes(record.fpState)
    ) {
      return res.status(400).json({
        success: false,
        message: `Basket SIP in '${record.fpState}' state cannot be cancelled`,
      });
    }

    const cancelPayload = record.basketPlans.map((p) => ({
      id: p.fpSipId,
      state: "cancelled",
    }));
    const cancelResults = await patchFpBatchSip(cancelPayload);

    const updatedBasketPlans = record.basketPlans.map((plan, i) => ({
      fpSipId: plan.fpSipId,
      isin: plan.isin,
      amount: plan.amount,
      fpState: cancelResults[i]?.state ?? "cancelled",
    }));

    await MfSip.updateOne(
      { _id: record._id },
      { $set: { fpState: "cancelled", basketPlans: updatedBasketPlans } },
    );

    return res.status(200).json({
      success: true,
      message: "Basket SIP cancelled successfully",
      data: { sipId: record._id, fpState: "cancelled" },
    });
  } catch (err) {
    console.error("❌ [BASKET SIP] Cancel error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
