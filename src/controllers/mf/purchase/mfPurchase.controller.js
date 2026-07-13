import MfPurchase from "../../../models/mf/purchase/mfPurchase.model.js";
import MfUserData from "../../../models/mf/mfUserData.model.js";
import MfSchemePlan from "../../../models/mf/master/mfSchemePlan.model.js";
import User from "../../../models/user/user.model.js";
import {
  createFpPurchase,
  fetchFpPurchase,
  patchFpPurchase,
  createFpPaymentNetbanking,
  createFpPaymentUpi,
  fetchFpPayment,
} from "../../../utils/mf/purchase/purchase.utils.js";
import {
  generateOtp,
  otpExpiresAt,
  sendConsentOtp,
  verifyConsentOtp,
} from "../../../utils/mf/consent.utils.js";
import { fetchFpSchemePlan } from "../../../utils/mf/master/schemePlan.utils.js";
import { patchFpBatchPurchase } from "../../../utils/mf/purchase/batchPurchase.utils.js";

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
          // gateway: "ondc",
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
    const { uniqueId } = req.user;
    const { isin, amount, payment_method, folio_number } = req.body;
    console.log(
      `\n🛒 [CREATE PURCHASE] user=${uniqueId} isin=${isin} amount=${amount}`
    );

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
    if (!payment_method || !["NETBANKING", "UPI"].includes(payment_method)) {
      return res.status(400).json({
        success: false,
        message: "payment_method is required. Allowed values: NETBANKING, UPI",
      });
    }

    /* ---------- STEP 1: GET INVESTMENT ACCOUNT ---------- */
    console.log(`  [1/5] Fetching MF user data...`);
    const mfData = await MfUserData.findOne({ uniqueId });
    const investmentAccount = mfData?.investmentAccount;
    if (!investmentAccount?.fpInvestmentAccountId) {
      console.warn(`  [1/5] ❌ No investment account found`);
      return res.status(400).json({
        success: false,
        message:
          "MF investment account not found. Complete account setup first.",
      });
    }
    console.log(
      `  [1/5] ✅ investmentAccount=${investmentAccount.fpInvestmentAccountId}`
    );

    /* ---------- STEP 2: RESOLVE SCHEME PLAN ---------- */
    console.log(`  [2/5] Resolving scheme for ISIN=${isin}...`);
    const scheme = await resolveScheme(isin);
    console.log(
      `  [2/5] ✅ scheme=${scheme.isin} gateway=${scheme.gateway} active=${scheme.active}`
    );
    if (!scheme.active) {
      return res.status(400).json({
        success: false,
        message: `Scheme ${isin} is currently inactive`,
      });
    }

    /* ---------- STEP 3: CREATE FP PURCHASE ---------- */
    const rawIp =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      "127.0.0.1";
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
      ...(folio_number && { folio_number: String(folio_number) }),
    };
    console.log(`  [3/5] Creating FP purchase... user_ip=${userIp}`);
    const fpData = await createFpPurchase(fpPayload);
    console.log(
      `  [3/5] ✅ fpPurchaseId=${fpData.id} fpOldId=${fpData.old_id} state=${fpData.state}`
    );

    /* ---------- STEP 4: SEND OTP ---------- */
    let phone = mfData?.phone?.number;
    let email = mfData?.email?.email;
    if (!phone || !email) {
      const user = await User.findOne({ uniqueId });
      if (!phone) phone = user?.phone;
      if (!email) email = user?.email;
    }
    if (!phone) {
      console.warn(`  [4/5] ❌ No phone found`);
      return res.status(400).json({
        success: false,
        message: "No phone number found for user. Cannot send consent OTP.",
      });
    }
    const otp = generateOtp();
    const expiry = otpExpiresAt();
    console.log(
      `  [4/5] Sending consent OTP to ${phone.slice(0, 3)}****${phone.slice(
        -3
      )}...`
    );
    await sendConsentOtp(phone, otp, email);
    console.log(`  [4/5] ✅ OTP sent`);

    /* ---------- STEP 5: STORE IN DB ---------- */
    console.log(`  [5/5] Saving purchase to DB...`);
    const record = await syncPurchaseToDb(uniqueId, fpData, {
      isin: scheme.isin,
      schemeName: scheme.schemeName,
      fundName: scheme.fundName,
      amount: Number(amount),
      paymentMethod: payment_method,
      otpCode: otp,
      otpExpiresAt: expiry,
      otpVerified: false,
    });
    console.log(`  [5/5] ✅ purchaseId=${record._id}`);

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
        otpSentTo: `${phone.slice(0, 3)}****${phone.slice(-3)}`,
        otpExpiresAt: record.otpExpiresAt,
      },
    });
  } catch (err) {
    console.error("❌ [CREATE PURCHASE] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/purchase/:id/confirm                                   */
/*  Step 2: Verify OTP → PATCH consent → Create payment → Confirm      */
/*                                                                      */
/*  Body: { otp, bank_account_id }                                      */
/*  :id  = our DB _id                                                   */
/* ------------------------------------------------------------------ */
export const confirmPurchase = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { id } = req.params;
    const { otp, bank_account_id } = req.body;
    console.log(`\n✅ [CONFIRM PURCHASE] purchaseId=${id} user=${uniqueId}`);

    if (!otp) {
      return res
        .status(400)
        .json({ success: false, message: "otp is required" });
    }
    if (!bank_account_id || isNaN(Number(bank_account_id))) {
      return res.status(400).json({
        success: false,
        message: "bank_account_id is required (numeric FP bank old_id)",
      });
    }

    /* ---------- STEP 1: FETCH PURCHASE RECORD ---------- */
    console.log(`  [1/7] Fetching purchase record...`);
    const record = await MfPurchase.findOne({ _id: id, uniqueId }).select(
      "+otpCode"
    );
    if (!record) {
      console.warn(`  [1/7] ❌ Purchase not found`);
      return res
        .status(404)
        .json({ success: false, message: "Purchase not found" });
    }
    if (record.consentGiven) {
      console.warn(`  [1/7] ❌ Consent already given`);
      return res.status(400).json({
        success: false,
        message: "Consent already given for this purchase",
      });
    }
    const orderLabel = record.isBasketOrder
      ? `basket (${record.basketOrders?.length ?? 0} orders)`
      : `fpPurchaseId=${record.fpPurchaseId} fpOldId=${record.fpOldId}`;
    console.log(`  [1/7] ✅ ${orderLabel} state=${record.fpState}`);

    /* ---------- STEP 2: VERIFY OTP ---------- */
    console.log(`  [2/7] Verifying OTP...`);
    const { valid, reason } = verifyConsentOtp(
      otp,
      record.otpCode,
      record.otpExpiresAt
    );
    if (!valid) {
      console.warn(`  [2/7] ❌ OTP invalid: ${reason}`);
      return res.status(400).json({ success: false, message: reason });
    }
    console.log(`  [2/7] ✅ OTP valid`);

    /* ---------- STEP 3: GET USER DETAILS ---------- */
    console.log(`  [3/7] Fetching user phone/email...`);
    const mfData = await MfUserData.findOne({ uniqueId });
    let phone = mfData?.phone?.number;
    let email = mfData?.email?.email;
    if (!phone || !email) {
      const user = await User.findOne({ uniqueId });
      if (!phone) phone = user?.phone;
      if (!email) email = user?.email;
    }
    if (!phone || !email) {
      console.warn(`  [3/7] ❌ Missing phone=${phone} email=${email}`);
      return res.status(400).json({
        success: false,
        message: "Phone and email are required for consent",
      });
    }
    console.log(
      `  [3/7] ✅ phone=${phone.slice(0, 3)}****${phone.slice(
        -3
      )} email=${email}`
    );

    /* ---------- STEP 4: PATCH CONSENT ON FP ---------- */
    const isd = mfData?.phone?.isd || "91";
    const consentPayload = { email, isd_code: isd, mobile: phone };

    if (record.isBasketOrder) {
      const orders = record.basketOrders ?? [];
      console.log(
        `  [4/7] Patching consent on ${orders.length} basket order(s) in parallel...`
      );
      console.log(
        `  [4/7] basketOrders:`,
        JSON.stringify(
          orders.map((o) => ({
            fpPurchaseId: o.fpPurchaseId,
            fpOldId: o.fpOldId,
            isin: o.isin,
          })),
          null,
          2
        )
      );
      console.log(
        `  [4/7] consentPayload:`,
        JSON.stringify(consentPayload, null, 2)
      );
      await Promise.all(
        orders.map((o) =>
          patchFpPurchase(o.fpPurchaseId, { consent: consentPayload })
        )
      );
    } else {
      console.log(`  [4/7] Patching consent on FP (isd=${isd})...`);
      await patchFpPurchase(record.fpPurchaseId, { consent: consentPayload });
    }
    console.log(`  [4/7] ✅ Consent patched`);

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

    /* ---------- STEP 5: CREATE PAYMENT ---------- */
    // FP state machine: consent (pending) → payment creation → confirm
    // Payment MUST be created while orders are in "pending" state.
    // Confirm PATCH happens after payment is created.
    const postbackUrl = `${process.env.APP_URL}/api/mf/purchase/payment-callback`;

    // For basket orders use all fpOldIds; for individual use single fpOldId
    const amcOrderIds = record.isBasketOrder
      ? record.fpOldIds ?? []
      : [record.fpOldId];
    const isUpi = record.paymentMethod === "UPI";
    console.log(
      `  [5/7] isBasketOrder=${record.isBasketOrder} paymentMethod=${record.paymentMethod} amcOrderIds=${JSON.stringify(amcOrderIds)} bank_account_id=${bank_account_id}`
    );

    const basePaymentPayload = {
      amc_order_ids: amcOrderIds,
      payment_postback_url: postbackUrl,
      provider_name: "ONDC",
      bank_account_id: Number(bank_account_id),
    };

    let fpPayment;
    let upiUri = null;

    if (isUpi) {
      // UPI flow: create payment → fetch payment to get the URI
      fpPayment = await createFpPaymentUpi(basePaymentPayload);
      console.log(`  [5/7] ✅ UPI payment created — id=${fpPayment.id}, fetching URI...`);

      // FP generates the URI asynchronously and delivers it via the
      // payment.updated webhook event. URI will be null here — the webhook
      // handler (payment.handler.js) saves it to DB when it arrives.
      console.log(`  [5/7] ✅ UPI payment created id=${fpPayment.id} — URI will arrive via payment.updated webhook`);
    } else {
      // Netbanking flow — existing behaviour
      const paymentPayload = {
        ...basePaymentPayload,
        method: "NETBANKING",
      };
      console.log("Payment payload", paymentPayload);
      fpPayment = await createFpPaymentNetbanking(paymentPayload);
      console.log(
        `  [5/7] ✅ fpPaymentId=${fpPayment.id} tokenUrl=${fpPayment.token_url}`
      );
    }

    /* ---------- STEP 6: PATCH STATE=CONFIRMED ---------- */
    // FP docs: consent (individual PATCH) → payment → batch confirm (PATCH /v2/mf_purchases/batch)
    // For basket: FP requires the Batch Update API — individual PATCHes cause race conditions
    // because creating a batch payment transitions all orders simultaneously.
    let confirmedState = "confirmed";
    let updatedBasketOrders = record.basketOrders ?? [];

    if (record.isBasketOrder) {
      const orders = record.basketOrders ?? [];
      const batchConfirmPayload = orders.map((o) => ({
        id: o.fpPurchaseId,
        state: "confirmed",
      }));
      console.log(
        `  [6/7] [BASKET] Batch confirming ${orders.length} order(s) via PATCH /v2/mf_purchases/batch...`
      );
      const batchResults = await patchFpBatchPurchase(batchConfirmPayload);

      updatedBasketOrders = orders.map((o, i) => ({
        ...o.toObject(),
        fpState: batchResults[i]?.state ?? o.fpState,
      }));

      confirmedState = batchResults[0]?.state ?? "confirmed";
      console.log(
        `  [6/7] ✅ Basket batch confirm done — states: ${batchResults
          .map((r) => r.state)
          .join(", ")}`
      );
    } else {
      const confirmedFpData = await patchFpPurchase(record.fpPurchaseId, {
        state: "confirmed",
      });
      confirmedState = confirmedFpData.state ?? "confirmed";
      console.log(`  [6/7] ✅ FP state=${confirmedState}`);
    }

    /* ---------- STEP 7: SAVE TO DB ---------- */
    console.log(`  [7/7] Saving payment info to DB...`);
    const dbUpdate = {
      fpPaymentId: fpPayment.id ?? null,
      tokenUrl:    fpPayment.token_url ?? null,
      upiUri:      upiUri,
      fpState:     confirmedState ?? "confirmed",
      rawPaymentResponse: fpPayment,
    };
    if (record.isBasketOrder) {
      dbUpdate.basketOrders = updatedBasketOrders;
    }
    const updated = await MfPurchase.findOneAndUpdate(
      { _id: record._id },
      { $set: dbUpdate },
      { new: true }
    );
    console.log(`  [7/7] ✅ Done — paymentMethod=${record.paymentMethod} tokenUrl=${updated.tokenUrl} upiUri=${updated.upiUri}`);

    return res.status(200).json({
      success: true,
      message: isUpi
        ? "Purchase confirmed. Use upiUri to complete payment."
        : "Purchase confirmed. Redirect user to payment URL.",
      data: {
        purchaseId:   updated._id,
        fpPurchaseId: updated.fpPurchaseId,
        fpState:      updated.fpState,
        fpPaymentId:  updated.fpPaymentId,
        paymentMethod: record.paymentMethod,
        // NETBANKING: redirect to tokenUrl; UPI: open upiUri in UPI app
        tokenUrl: updated.tokenUrl,
        upiUri:   updated.upiUri,
      },
    });
  } catch (err) {
    console.error("❌ [CONFIRM PURCHASE] Error:", err.message);
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
    const mfData = await MfUserData.findOne({ uniqueId });
    let phone = mfData?.phone?.number;
    let email = mfData?.email?.email;
    if (!phone || !email) {
      const user = await User.findOne({ uniqueId });
      if (!phone) phone = user?.phone;
      if (!email) email = user?.email;
    }

    if (!phone) {
      return res
        .status(400)
        .json({ success: false, message: "No phone number found" });
    }

    const otp = generateOtp();
    const expiry = otpExpiresAt();

    await sendConsentOtp(phone, otp, email);

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
        upiUri: updated.upiUri,
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
/*  GET /api/mf/purchase/:id/payment-status                             */
/*  Frontend polls this to know if payment succeeded.                   */
/*  Returns clean status + upiUri (for UPI polling before payment).    */
/* ------------------------------------------------------------------ */
export const getPaymentStatus = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { id } = req.params;

    const record = await MfPurchase.findOne({ _id: id, uniqueId });
    if (!record) {
      return res.status(404).json({ success: false, message: "Purchase not found" });
    }
    if (!record.fpPaymentId) {
      return res.status(400).json({ success: false, message: "Payment not yet initiated for this purchase" });
    }

    // Fetch live payment status from FP
    const fpPayment = await fetchFpPayment(record.fpPaymentId);

    // For UPI — save URI if it just arrived
    const upiUri = fpPayment?.upi?.uri ?? record.upiUri ?? null;
    if (upiUri && !record.upiUri) {
      await MfPurchase.updateOne({ _id: record._id }, { $set: { upiUri } });
    }

    return res.json({
      success: true,
      data: {
        purchaseId:    record._id,
        fpPaymentId:   fpPayment.id,
        paymentMethod: fpPayment.method,
        status:        fpPayment.status,   // PENDING | SUCCESS | FAILED
        amount:        fpPayment.amount,
        // NETBANKING: redirect here; UPI: null
        tokenUrl:      record.tokenUrl ?? null,
        // UPI: open this deep-link; NETBANKING: null
        upiUri:        upiUri,
        failedReason:  fpPayment.failed_reason ?? null,
      },
    });
  } catch (err) {
    console.error("❌ [PAYMENT STATUS] Error:", err.message);
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
      `\n📩 [PAYMENT CALLBACK] Received postback body:`,
      JSON.stringify(body, null, 2)
    );

    const fpPaymentId = body.payment_id || body.id;
    if (!fpPaymentId) {
      console.warn(`  ⚠️  No payment_id in postback — ignoring`);
      return res.status(200).send("OK");
    }
    console.log(`  fpPaymentId=${fpPaymentId}`);

    // Fetch fresh payment status from FP
    let fpPayment;
    try {
      console.log(`  Fetching payment status from FP...`);
      fpPayment = await fetchFpPayment(fpPaymentId);
      console.log(
        `  ✅ FP payment state=${
          fpPayment.state
        } amc_order_ids=${JSON.stringify(fpPayment.amc_order_ids)}`
      );
    } catch (e) {
      console.error(`  ❌ Failed to fetch payment from FP: ${e.message}`);
      return res.status(200).send("OK");
    }

    const orderIds = fpPayment.amc_order_ids ?? [];
    console.log(
      `  Updating ${orderIds.length} purchase(s) with fpOldIds=${JSON.stringify(
        orderIds
      )}...`
    );

    if (orderIds.length > 0) {
      await MfPurchase.updateMany(
        { fpOldId: { $in: orderIds } },
        { $set: { rawPaymentResponse: fpPayment, fpPaymentId: fpPayment.id } }
      );
      console.log(`  ✅ Bulk update done`);
    }

    // Refresh individual FP order states
    for (const oldId of orderIds) {
      const purchase = await MfPurchase.findOne({ fpOldId: oldId });
      if (purchase?.fpPurchaseId) {
        try {
          const fpOrder = await fetchFpPurchase(purchase.fpPurchaseId);
          await MfPurchase.updateOne(
            { _id: purchase._id },
            { $set: { fpState: fpOrder.state, rawPurchaseResponse: fpOrder } }
          );
          console.log(
            `  ✅ Purchase ${purchase._id} state refreshed → ${fpOrder.state}`
          );
        } catch {
          console.warn(
            `  ⚠️  Could not refresh state for purchase fpOldId=${oldId}`
          );
        }
      } else {
        console.warn(`  ⚠️  No local purchase found for fpOldId=${oldId}`);
      }
    }

    return res.status(200).send("OK");
  } catch (err) {
    console.error("❌ [PAYMENT CALLBACK] Error:", err.message);
    return res.status(200).send("OK");
  }
};
