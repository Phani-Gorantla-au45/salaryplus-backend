import MfSip from "../../../models/mf/sip/mfSip.model.js";
import MfUserData from "../../../models/mf/mfUserData.model.js";
import MfSchemePlan from "../../../models/mf/master/mfSchemePlan.model.js";
import User from "../../../models/user/user.model.js";
import UserGoal from "../../../models/goals/userGoal.model.js";
import {
  createFpSip,
  patchFpSip,
  fetchFpSip,
} from "../../../utils/mf/sip/sip.utils.js";
import { fetchFpSchemePlan } from "../../../utils/mf/master/schemePlan.utils.js";
import {
  generateOtp,
  otpExpiresAt,
  sendConsentOtp,
  verifyConsentOtp,
} from "../../../utils/mf/consent.utils.js";

/* ------------------------------------------------------------------ */
/*  Internal — get scheme from cache or FP                              */
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

/* ------------------------------------------------------------------ */
/*  Internal — map FP plan response → DB sync fields                    */
/* ------------------------------------------------------------------ */
const sipFromFp = (fp) => ({
  fpState: fp.state ?? "created",
  startDate: fp.start_date ?? null,
  endDate: fp.end_date ?? null,
  nextInstallmentDate: fp.next_installment_date ?? null,
  remainingInstallments: fp.remaining_installments ?? null,
  rawSipResponse: fp,
});

/* ------------------------------------------------------------------ */
/*  Internal — get user's IP from request                               */
/* ------------------------------------------------------------------ */
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
/*  POST /api/mf/sip                                                    */
/*  Step 1: Create SIP purchase plan on FP + send consent OTP.         */
/*                                                                      */
/*  Body: {                                                             */
/*    isin, frequency, amount,                                          */
/*    installment_day?,          (required for monthly)                 */
/*    payment_source,            (fpMandateId numeric)                  */
/*    number_of_installments?,   (default 120)                          */
/*    generate_first_installment_now?, (default false)                  */
/*    folio_number?                                                     */
/*  }                                                                   */
/* ------------------------------------------------------------------ */
export const createSip = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const {
      isin,
      frequency,
      amount,
      installment_day,
      payment_source,
      years,
      generate_first_installment_now = false,
      folio_number,
      goal_id,
    } = req.body;

    const number_of_installments =
      frequency === "daily" ? Number(years || 3) * 365 : Number(years || 25) * 12;

    /* ---------- VALIDATE ---------- */
    if (!isin)
      return res
        .status(400)
        .json({ success: false, message: "isin is required" });
    if (!frequency || !["daily", "monthly"].includes(frequency)) {
      return res.status(400).json({
        success: false,
        message: "frequency must be daily or monthly",
      });
    }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "amount must be a positive number" });
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

    /* ---------- STEP 1: GET INVESTMENT ACCOUNT ---------- */
    console.log(
      `\n📋 [CREATE SIP] user=${uniqueId} isin=${isin} freq=${frequency} amount=${amount}`,
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

    /* ---------- STEP 2: RESOLVE SCHEME ---------- */
    const scheme = await resolveScheme(isin);
    if (!scheme.active) {
      return res.status(400).json({
        success: false,
        message: `Scheme ${isin} is currently inactive`,
      });
    }
    console.log(`  [2/4] ✅ scheme=${scheme.isin}`);

    /* ---------- STEP 3: CREATE FP SIP ---------- */
    const fpPayload = {
      mf_investment_account: fpInvestmentAccountId,
      scheme: scheme.isin,
      frequency,
      amount: Number(amount),
      number_of_installments: Number(number_of_installments),
      systematic: true,
      payment_method: "mandate",
      payment_source: String(payment_source),
      auto_generate_installments: true,
      initiated_by: "investor",
      initiated_via: "mobile_app",
      // gateway:                      "ondc",
      user_ip: resolveUserIp(req),
      generate_first_installment_now: Boolean(generate_first_installment_now),
      ...(frequency === "monthly" && {
        installment_day: Number(installment_day),
      }),
      ...(folio_number && { folio_number }),
    };

    const fpData = await createFpSip(fpPayload);
    console.log(`  [3/4] ✅ fpSipId=${fpData.id} state=${fpData.state}`);

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
      { fpSipId: fpData.id },
      {
        $set: {
          uniqueId,
          fpSipId: fpData.id,
          isBasketSip: false,
          isin: scheme.isin,
          schemeName: scheme.schemeName,
          fundName: scheme.fundName,
          mfInvestmentAccountId: fpInvestmentAccountId,
          frequency,
          amount: Number(amount),
          installmentDay:
            frequency === "monthly" ? Number(installment_day) : null,
          numberOfInstallments: Number(number_of_installments),
          systematic: true,
          folioNumber: folio_number ?? null,
          generateFirstInstallmentNow: Boolean(generate_first_installment_now),
          paymentMethod: "mandate",
          paymentSource: String(payment_source),
          fpState: fpData.state ?? "created",
          otpCode: otp,
          otpExpiresAt: expiry,
          otpVerified: false,
          rawSipResponse: fpData,
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
      console.log(`  ✅ Linked SIP ${record._id} → goal ${goal_id}`);
    }

    return res.status(201).json({
      success: true,
      message:
        "SIP created. OTP sent for consent. Call POST /api/mf/sip/:id/confirm with OTP.",
      data: {
        sipId: record._id,
        fpSipId: record.fpSipId,
        isin: record.isin,
        schemeName: record.schemeName,
        frequency: record.frequency,
        amount: record.amount,
        fpState: record.fpState,
        otpSentTo: `${phone.slice(0, 3)}****${phone.slice(-3)}`,
        otpExpiresAt: expiry,
      },
    });
  } catch (err) {
    console.error("❌ [CREATE SIP] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/sip/:id/confirm                                        */
/*  Step 2: Verify OTP → PATCH consent + state=confirmed on FP.        */
/*                                                                      */
/*  Body: { otp }                                                       */
/*  :id = our DB _id                                                    */
/* ------------------------------------------------------------------ */
export const confirmSip = async (req, res) => {
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
      isBasketSip: false,
    }).select("+otpCode");
    if (!record)
      return res.status(404).json({ success: false, message: "SIP not found" });
    if (record.consentGiven) {
      return res.status(400).json({
        success: false,
        message: "Consent already given for this SIP",
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

    /* ---------- CHECK FP STATE ---------- */
    console.log(`\n✅ [CONFIRM SIP] sipId=${id} — checking FP state...`);
    const fpData = await fetchFpSip(record.fpSipId);
    console.log(`  FP state=${fpData.state}`);

    if (fpData.state === "failed") {
      return res.status(400).json({
        success: false,
        message: "SIP plan failed during review. Please create a new SIP.",
      });
    }
    if (!["review_completed", "created"].includes(fpData.state)) {
      return res.status(400).json({
        success: false,
        message: `SIP is in '${fpData.state}' state. Cannot confirm at this stage.`,
        fpState: fpData.state,
      });
    }
    if (fpData.state === "created") {
      // Still under async review by FP — OTP is verified, save consent status but inform retry
      await MfSip.updateOne(
        { _id: record._id },
        { $set: { otpVerified: true, otpCode: null } },
      );
      return res.status(202).json({
        success: false,
        message:
          "OTP verified. SIP is still under FP review. Please retry confirm in a few seconds.",
        fpState: "created",
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

    /* ---------- PATCH CONSENT + CONFIRMED ---------- */
    console.log(`  Patching consent + state=confirmed on FP...`);
    const confirmed = await patchFpSip({
      id: record.fpSipId,
      state: "confirmed",
      consent: { email, isd_code: isd, mobile: phone },
    });
    console.log(`  ✅ FP state=${confirmed.state}`);

    /* ---------- SAVE TO DB ---------- */
    const updated = await MfSip.findOneAndUpdate(
      { _id: record._id },
      {
        $set: {
          otpVerified: true,
          consentGiven: true,
          consentAt: new Date(),
          otpCode: null,
          ...sipFromFp(confirmed),
        },
      },
      { new: true },
    );

    return res.status(200).json({
      success: true,
      message: "SIP confirmed successfully.",
      data: sipPublicResponse(updated),
    });
  } catch (err) {
    console.error("❌ [CONFIRM SIP] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/sip/:id/resend-otp                                     */
/* ------------------------------------------------------------------ */
export const resendSipOtp = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { id } = req.params;

    const record = await MfSip.findOne({ _id: id, uniqueId });
    if (!record)
      return res.status(404).json({ success: false, message: "SIP not found" });
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
    console.error("❌ [SIP] Resend OTP error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/sip/:id                                                 */
/*  Get single SIP — refreshes state from FP.                          */
/* ------------------------------------------------------------------ */
export const getSip = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { id } = req.params;

    const isMongoId = /^[a-f\d]{24}$/i.test(id);
    const query = isMongoId ? { _id: id, uniqueId } : { fpSipId: id, uniqueId };
    const record = await MfSip.findOne(query);
    if (!record)
      return res.status(404).json({ success: false, message: "SIP not found" });

    // Refresh from FP
    try {
      const fpData = await fetchFpSip(record.fpSipId);
      await MfSip.updateOne({ _id: record._id }, { $set: sipFromFp(fpData) });
    } catch {
      console.warn(
        `⚠️  [SIP] FP refresh failed for ${record.fpSipId}, returning cached`,
      );
    }

    const updated = await MfSip.findById(record._id);
    return res
      .status(200)
      .json({ success: true, data: sipPublicResponse(updated) });
  } catch (err) {
    console.error("❌ [SIP] Get error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/sip                                                     */
/*  List all SIPs for the authenticated user.                           */
/*  Query: ?state=active&frequency=monthly                              */
/* ------------------------------------------------------------------ */
export const listSips = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { state, frequency } = req.query;

    const filter = { uniqueId };
    if (state) filter.fpState = state;
    if (frequency) filter.frequency = frequency;

    const sips = await MfSip.find(filter).sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      count: sips.length,
      data: sips.map(sipPublicResponse),
    });
  } catch (err) {
    console.error("❌ [SIP] List error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/sip/:id/cancel                                         */
/*  Cancels a SIP in created or active state.                           */
/* ------------------------------------------------------------------ */
export const cancelSip = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { id } = req.params;

    const record = await MfSip.findOne({ _id: id, uniqueId });
    if (!record)
      return res.status(404).json({ success: false, message: "SIP not found" });
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
        message: `SIP in '${record.fpState}' state cannot be cancelled`,
      });
    }

    const fpData = await patchFpSip({ id: record.fpSipId, state: "cancelled" });
    await MfSip.updateOne({ _id: record._id }, { $set: sipFromFp(fpData) });

    return res.status(200).json({
      success: true,
      message: "SIP cancelled successfully",
      data: { sipId: record._id, fpState: fpData.state },
    });
  } catch (err) {
    console.error("❌ [SIP] Cancel error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  Internal — public response shape                                    */
/* ------------------------------------------------------------------ */
export const sipPublicResponse = (s) => ({
  sipId: s._id,
  fpSipId: s.fpSipId,
  isBasketSip: s.isBasketSip,
  isin: s.isin,
  schemeName: s.schemeName,
  fundName: s.fundName,
  basketFunds: s.basketFunds?.length ? s.basketFunds : undefined,
  basketPlans: s.basketPlans?.length ? s.basketPlans : undefined,
  frequency: s.frequency,
  amount: s.amount,
  installmentDay: s.installmentDay,
  numberOfInstallments: s.numberOfInstallments,
  paymentMethod: s.paymentMethod,
  paymentSource: s.paymentSource,
  fpState: s.fpState,
  consentGiven: s.consentGiven,
  startDate: s.startDate,
  nextInstallmentDate: s.nextInstallmentDate,
  remainingInstallments: s.remainingInstallments,
  otpExpiresAt: s.otpExpiresAt,
  linkedGoalId: s.linkedGoalId ?? null,
  createdAt: s.createdAt,
});
