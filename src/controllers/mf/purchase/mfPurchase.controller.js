import MfPurchase from "../../../models/mf/purchase/mfPurchase.model.js";
import MfInvestmentAccount from "../../../models/mf/mfInvestmentAccount.model.js";
import MfSchemePlan from "../../../models/mf/master/mfSchemePlan.model.js";
import PhoneNumber from "../../../models/mf/phoneNumber.model.js";
import EmailAddress from "../../../models/mf/emailAddress.model.js";
import User from "../../../models/user/user.model.js";
import {
  createFpPurchase,
  fetchFpPurchase,
  patchFpPurchase,
  createFpPaymentNetbanking,
  fetchFpPayment,
} from "../../../utils/mf/purchase/purchase.utils.js";
import {
  generateOtp,
  otpExpiresAt,
  sendConsentOtp,
  verifyConsentOtp,
} from "../../../utils/mf/consent.utils.js";
import { fetchFpSchemePlan } from "../../../utils/mf/master/schemePlan.utils.js";

/* ------------------------------------------------------------------ */
/*  Internal helper — sync FP purchase response → DB                    */
/* ------------------------------------------------------------------ */
const syncPurchaseToDb = async (uniqueId, fpData, extraFields = {}) => {
  return MfPurchase.findOneAndUpdate(
    { fpPurchaseId: fpData.id },
    {
      $set: {
        uniqueId,
        fpPurchaseId: fpData.id,
        fpOldId: fpData.old_id ?? null,
        mfInvestmentAccountId: fpData.mf_investment_account ?? null,
        fpState: fpData.state ?? "created",
        rawPurchaseResponse: fpData,
        ...extraFields,
      },
    },
    { upsert: true, new: true }
  );
};

/* ------------------------------------------------------------------ */
/*  Internal helper — get scheme plan (cache-first, live fallback)      */
/* ------------------------------------------------------------------ */
const resolveScheme = async (isin) => {
  const upper = isin?.toUpperCase().trim();
  let scheme = await MfSchemePlan.findOne({ isin: upper });

  // If not in cache (or missing key fields), fetch from FP and cache it
  if (!scheme?.syncedAt) {
    console.log(
      `🔄 [PURCHASE] Scheme not cached — fetching from FP for ISIN: ${upper}`
    );
    const fpData = await fetchFpSchemePlan(upper);

    scheme = await MfSchemePlan.findOneAndUpdate(
      { isin: upper },
      {
        $set: {
          isin: fpData.isin?.toUpperCase() || upper,
          gateway: fpData.gateway || "cybrillapoa",
          schemeName: fpData.mf_scheme?.name ?? null,
          fundName: fpData.mf_fund?.name ?? null,
          type: fpData.type,
          option: fpData.option,
          active: fpData.active ?? true,
          thresholds: fpData.thresholds ?? [],
          syncedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );
  }

  if (!scheme) {
    throw new Error(`Scheme not found for ISIN: ${upper}`);
  }

  return scheme;
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/purchase                                               */
/*  Step 1: Create purchase order on FP + send consent OTP to user.    */
/*                                                                      */
/*  Body: { isin, amount, paymentMethod? }                              */
/* ------------------------------------------------------------------ */
export const createPurchase = async (req, res) => {
  try {
    console.log("Inside create purchase");
    const { uniqueId } = req.user;
    const { isin, amount, paymentMethod = "netbanking" } = req.body;

    /* ---------- VALIDATE INPUT ---------- */
    if (!isin) {
      return res
        .status(400)
        .json({ success: false, message: "isin is required" });
    }
    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "amount must be a positive number" });
    }

    /* ---------- GET INVESTMENT ACCOUNT ---------- */
    const investmentAccount = await MfInvestmentAccount.findOne({ uniqueId });
    if (!investmentAccount?.fpInvestmentAccountId) {
      return res.status(400).json({
        success: false,
        message:
          "MF investment account not found. Complete account setup first.",
      });
    }

    /* ---------- RESOLVE SCHEME PLAN ---------- */
    const scheme = await resolveScheme(isin);
    console.log("Scheme resp", scheme);
    if (!scheme.active) {
      return res.status(400).json({
        success: false,
        message: `Scheme ${isin} is currently inactive`,
      });
    }

    /* ---------- CREATE FP PURCHASE ---------- */
    // Capture user IP — required by FP (must be plain IPv4)
    const rawIp =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      "127.0.0.1";
    // Strip IPv6-mapped IPv4 prefix (e.g. ::ffff:127.0.0.1 → 127.0.0.1)
    const userIp = rawIp.startsWith("::ffff:")
      ? rawIp.slice(7)
      : rawIp === "::1"
      ? "127.0.0.1"
      : rawIp;

    const fpPayload = {
      mf_investment_account: investmentAccount.fpInvestmentAccountId,
      scheme: scheme.isin,
      amount: Number(amount),
      user_ip: userIp,
      gateway: "ondc",
    };

    const fpData = await createFpPurchase(fpPayload);

    /* ---------- SEND OTP TO USER ---------- */
    // Prefer MF phone number; fallback to User registration phone
    let phone;
    const mfPhone = await PhoneNumber.findOne({ uniqueId });
    if (mfPhone?.number) {
      phone = mfPhone.number;
    } else {
      const user = await User.findOne({ uniqueId });
      phone = user?.phone;
    }

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "No phone number found for user. Cannot send consent OTP.",
      });
    }

    const otp = generateOtp();
    const expiry = otpExpiresAt();

    await sendConsentOtp(phone, otp);

    /* ---------- STORE IN DB ---------- */
    const record = await syncPurchaseToDb(uniqueId, fpData, {
      isin: scheme.isin,
      schemeName: scheme.schemeName,
      fundName: scheme.fundName,
      amount: Number(amount),
      paymentMethod,
      otpCode: otp,
      otpExpiresAt: expiry,
      otpVerified: false,
    });

    const maskedPhone = `${phone.slice(0, 3)}****${phone.slice(-3)}`;

    return res.status(201).json({
      success: true,
      message: "Purchase order created. OTP sent for consent.",
      data: {
        purchaseId: record._id,
        fpPurchaseId: record.fpPurchaseId,
        isin: record.isin,
        schemeName: record.schemeName,
        amount: record.amount,
        paymentMethod: record.paymentMethod,
        fpState: record.fpState,
        otpSentTo: maskedPhone,
        otpExpiresAt: record.otpExpiresAt,
      },
    });
  } catch (err) {
    console.error("❌ [PURCHASE] Create error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/purchase/:id/confirm                                   */
/*  Step 2: Verify OTP → PATCH consent → Create payment → Confirm      */
/*                                                                      */
/*  Body: { otp, returnUrl }                                            */
/*  :id  = our DB _id                                                   */
/* ------------------------------------------------------------------ */
export const confirmPurchase = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { id } = req.params;
    const { otp, returnUrl } = req.body;

    if (!otp) {
      return res
        .status(400)
        .json({ success: false, message: "otp is required" });
    }

    /* ---------- FETCH PURCHASE RECORD (with otpCode) ---------- */
    const record = await MfPurchase.findOne({ _id: id, uniqueId }).select(
      "+otpCode"
    );

    if (!record) {
      return res
        .status(404)
        .json({ success: false, message: "Purchase not found" });
    }
    if (record.consentGiven) {
      return res.status(400).json({
        success: false,
        message: "Consent already given for this purchase",
      });
    }

    /* ---------- VERIFY OTP ---------- */
    const { valid, reason } = verifyConsentOtp(
      otp,
      record.otpCode,
      record.otpExpiresAt
    );
    if (!valid) {
      return res.status(400).json({ success: false, message: reason });
    }

    /* ---------- GET USER DETAILS FOR CONSENT ---------- */
    const [mfPhone, mfEmail] = await Promise.all([
      PhoneNumber.findOne({ uniqueId }),
      EmailAddress.findOne({ uniqueId }),
    ]);

    let phone, email;

    if (mfPhone?.number) {
      phone = mfPhone.number;
    } else {
      const user = await User.findOne({ uniqueId });
      phone = user?.phone;
    }

    if (mfEmail?.email) {
      email = mfEmail.email;
    } else {
      const user = await User.findOne({ uniqueId });
      email = user?.email;
    }

    if (!phone || !email) {
      return res.status(400).json({
        success: false,
        message: "Phone and email are required for consent",
      });
    }

    /* ---------- PATCH CONSENT ON FP ---------- */
    const isd = mfPhone?.isd || "91";
    await patchFpPurchase(record.fpPurchaseId, {
      consent: {
        email,
        isd_code: isd,
        mobile: phone,
      },
    });

    /* ---------- MARK CONSENT IN DB ---------- */
    await MfPurchase.updateOne(
      { _id: record._id },
      {
        $set: {
          otpVerified: true,
          consentGiven: true,
          consentAt: new Date(),
          otpCode: null,
        },
      }
    );

    /* ---------- CREATE PAYMENT ---------- */
    const postbackUrl = `${process.env.APP_URL}/api/mf/purchase/payment-callback`;
    const paymentPayload = {
      amc_order_ids: [record.fpOldId],
      payment_method: record.paymentMethod?.toUpperCase() ?? "NETBANKING",
      return_url: returnUrl || `${process.env.APP_URL}/mf/purchase/complete`,
      payment_postback_url: postbackUrl,
    };

    const fpPayment = await createFpPaymentNetbanking(paymentPayload);

    /* ---------- PATCH STATE=CONFIRMED ON FP ---------- */
    const confirmedFpData = await patchFpPurchase(record.fpPurchaseId, {
      state: "confirmed",
    });

    /* ---------- SAVE PAYMENT INFO TO DB ---------- */
    const updated = await MfPurchase.findOneAndUpdate(
      { _id: record._id },
      {
        $set: {
          fpPaymentId: fpPayment.id ?? null,
          tokenUrl: fpPayment.token_url ?? null,
          fpState: confirmedFpData.state ?? "confirmed",
          rawPaymentResponse: fpPayment,
        },
      },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      message: "Purchase confirmed. Redirect user to payment URL.",
      data: {
        purchaseId: updated._id,
        fpPurchaseId: updated.fpPurchaseId,
        fpState: updated.fpState,
        fpPaymentId: updated.fpPaymentId,
        tokenUrl: updated.tokenUrl,
      },
    });
  } catch (err) {
    console.error("❌ [PURCHASE] Confirm error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/purchase/:id/resend-otp                                */
/*  Resend consent OTP (e.g. if expired).                               */
/* ------------------------------------------------------------------ */
export const resendOtp = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { id } = req.params;

    const record = await MfPurchase.findOne({ _id: id, uniqueId });
    if (!record) {
      return res
        .status(404)
        .json({ success: false, message: "Purchase not found" });
    }
    if (record.consentGiven) {
      return res
        .status(400)
        .json({ success: false, message: "Consent already given" });
    }

    /* ---------- GET PHONE ---------- */
    let phone;
    const mfPhone = await PhoneNumber.findOne({ uniqueId });
    if (mfPhone?.number) {
      phone = mfPhone.number;
    } else {
      const user = await User.findOne({ uniqueId });
      phone = user?.phone;
    }

    if (!phone) {
      return res
        .status(400)
        .json({ success: false, message: "No phone number found" });
    }

    const otp = generateOtp();
    const expiry = otpExpiresAt();

    await sendConsentOtp(phone, otp);

    await MfPurchase.updateOne(
      { _id: record._id },
      { $set: { otpCode: otp, otpExpiresAt: expiry, otpVerified: false } }
    );

    return res.status(200).json({
      success: true,
      message: "OTP resent successfully",
      otpExpiresAt: expiry,
    });
  } catch (err) {
    console.error("❌ [PURCHASE] Resend OTP error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/purchase/:id                                            */
/*  Get single purchase (refreshes state from FP).                     */
/* ------------------------------------------------------------------ */
export const getPurchase = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { id } = req.params;

    const record = await MfPurchase.findOne({ _id: id, uniqueId });
    if (!record) {
      return res
        .status(404)
        .json({ success: false, message: "Purchase not found" });
    }

    // Refresh state from FP
    let fpData;
    try {
      fpData = await fetchFpPurchase(record.fpPurchaseId);
      await MfPurchase.updateOne(
        { _id: record._id },
        { $set: { fpState: fpData.state, rawPurchaseResponse: fpData } }
      );
    } catch {
      // Non-fatal — return cached state
      console.warn(
        `⚠️  [PURCHASE] FP refresh failed for ${record.fpPurchaseId}, returning cached state`
      );
    }

    const updated = await MfPurchase.findById(record._id);

    return res.status(200).json({
      success: true,
      data: {
        purchaseId: updated._id,
        fpPurchaseId: updated.fpPurchaseId,
        isin: updated.isin,
        schemeName: updated.schemeName,
        fundName: updated.fundName,
        amount: updated.amount,
        paymentMethod: updated.paymentMethod,
        fpState: updated.fpState,
        consentGiven: updated.consentGiven,
        consentAt: updated.consentAt,
        fpPaymentId: updated.fpPaymentId,
        tokenUrl: updated.tokenUrl,
        createdAt: updated.createdAt,
      },
    });
  } catch (err) {
    console.error("❌ [PURCHASE] Get error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/purchase                                                */
/*  List all purchases for the authenticated user.                      */
/* ------------------------------------------------------------------ */
export const listPurchases = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { state, isin } = req.query;

    const filter = { uniqueId };
    if (state) filter.fpState = state;
    if (isin) filter.isin = isin.toUpperCase();

    const purchases = await MfPurchase.find(filter).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: purchases.length,
      data: purchases.map((p) => ({
        purchaseId: p._id,
        fpPurchaseId: p.fpPurchaseId,
        isin: p.isin,
        schemeName: p.schemeName,
        amount: p.amount,
        paymentMethod: p.paymentMethod,
        fpState: p.fpState,
        consentGiven: p.consentGiven,
        tokenUrl: p.tokenUrl,
        createdAt: p.createdAt,
      })),
    });
  } catch (err) {
    console.error("❌ [PURCHASE] List error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/purchase/payment-callback                              */
/*  Payment postback handler — called by FP after payment completion.   */
/*  No auth — FP POSTs a form to this URL.                              */
/* ------------------------------------------------------------------ */
export const paymentCallback = async (req, res) => {
  try {
    const body = req.body;
    console.log(
      "📩 [PURCHASE CALLBACK] Received payment postback:",
      JSON.stringify(body, null, 2)
    );

    const fpPaymentId = body.payment_id || body.id;
    if (!fpPaymentId) {
      console.warn("⚠️  [PURCHASE CALLBACK] No payment_id in postback body");
      return res.status(200).send("OK"); // Always return 200 to FP
    }

    // Fetch fresh payment status from FP
    let fpPayment;
    try {
      fpPayment = await fetchFpPayment(fpPaymentId);
    } catch (e) {
      console.error(
        "❌ [PURCHASE CALLBACK] Failed to fetch payment:",
        e.message
      );
      return res.status(200).send("OK");
    }

    console.log(
      `📩 [PURCHASE CALLBACK] Payment ${fpPaymentId} state: ${fpPayment.state}`
    );

    // Map FP payment -> update purchase records
    // amc_order_ids in the payment contains old_id (numeric) of each purchase
    const orderIds = fpPayment.amc_order_ids ?? [];
    if (orderIds.length > 0) {
      await MfPurchase.updateMany(
        { fpOldId: { $in: orderIds } },
        {
          $set: {
            rawPaymentResponse: fpPayment,
            fpPaymentId: fpPayment.id,
            // If payment is successful, FP also triggers an order state update via webhooks
          },
        }
      );
      console.log(
        `✅ [PURCHASE CALLBACK] Updated ${orderIds.length} purchase(s)`
      );
    }

    // Also update purchase state by fetching individual FP orders (optional refresh)
    for (const oldId of orderIds) {
      const purchase = await MfPurchase.findOne({ fpOldId: oldId });
      if (purchase?.fpPurchaseId) {
        try {
          const fpOrder = await fetchFpPurchase(purchase.fpPurchaseId);
          await MfPurchase.updateOne(
            { _id: purchase._id },
            { $set: { fpState: fpOrder.state, rawPurchaseResponse: fpOrder } }
          );
        } catch {
          // Non-fatal
        }
      }
    }

    return res.status(200).send("OK");
  } catch (err) {
    console.error("❌ [PURCHASE CALLBACK] Error:", err.message);
    return res.status(200).send("OK"); // Always 200 to prevent FP retry loop
  }
};
