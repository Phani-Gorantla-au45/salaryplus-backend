import MfPurchase from "../../../models/mf/purchase/mfPurchase.model.js";
import MfUserData from "../../../models/mf/mfUserData.model.js";
import MfSchemePlan from "../../../models/mf/master/mfSchemePlan.model.js";
import User from "../../../models/user/user.model.js";
import {
  createFpPurchase,
  fetchFpPurchase,
  patchFpPurchase,
  createFpPaymentNetbanking,
  fetchFpPayment,
} from "../../../utils/mf/purchase/purchase.utils.js";
import { fetchFpBankAccount } from "../../../utils/mf/bankAccount.utils.js";
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
    const { isin, amount, paymentMethod = "netbanking" } = req.body;
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
    };
    console.log(`  [3/5] Creating FP purchase... user_ip=${userIp}`);
    const fpData = await createFpPurchase(fpPayload);
    console.log(
      `  [3/5] ✅ fpPurchaseId=${fpData.id} fpOldId=${fpData.old_id} state=${fpData.state}`
    );

    /* ---------- STEP 4: SEND OTP ---------- */
    let phone = mfData?.phone?.number;
    if (!phone) {
      const user = await User.findOne({ uniqueId });
      phone = user?.phone;
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
    await sendConsentOtp(phone, otp);
    console.log(`  [4/5] ✅ OTP sent`);

    /* ---------- STEP 5: STORE IN DB ---------- */
    console.log(`  [5/5] Saving purchase to DB...`);
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
/*  Body: { otp, returnUrl }                                            */
/*  :id  = our DB _id                                                   */
/* ------------------------------------------------------------------ */
export const confirmPurchase = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { id } = req.params;
    const { otp } = req.body;
    console.log(`\n✅ [CONFIRM PURCHASE] purchaseId=${id} user=${uniqueId}`);

    if (!otp) {
      return res
        .status(400)
        .json({ success: false, message: "otp is required" });
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
    // ONDC state machine: created → under_review (consent) → payment_pending (payment) → payment_captured → submitted (confirm)
    // Payment must be created while orders are in under_review — confirm PATCH happens AFTER payment.
    const postbackUrl = `${process.env.APP_URL}/api/mf/purchase/payment-callback`;

    // Resolve bank account old_id — required by FP for TPV
    let bankAccountOldId = mfData?.bankAccount?.fpBankAccountOldId ?? null;
    if (!bankAccountOldId && mfData?.bankAccount?.fpBankAccountId) {
      console.log(`  [5/7] fpBankAccountOldId missing — fetching from FP...`);
      try {
        const fpBa = await fetchFpBankAccount(
          mfData.bankAccount.fpBankAccountId
        );
        bankAccountOldId = fpBa.old_id ?? null;
        if (bankAccountOldId) {
          await MfUserData.updateOne(
            { uniqueId },
            { $set: { "bankAccount.fpBankAccountOldId": bankAccountOldId } }
          );
          console.log(
            `  [5/7] ✅ Fetched bankAccountOldId=${bankAccountOldId}`
          );
        }
      } catch (e) {
        console.warn(
          `  [5/7] ⚠️  Could not fetch bank account old_id: ${e.message}`
        );
      }
    }

    if (!bankAccountOldId) {
      return res.status(400).json({
        success: false,
        message:
          "Bank account numeric ID (old_id) not available. Please re-link your bank account.",
      });
    }

    // For basket orders use all fpOldIds; for individual use single fpOldId
    const amcOrderIds = record.isBasketOrder
      ? record.fpOldIds ?? []
      : [record.fpOldId];
    console.log(
      `  [5/7] isBasketOrder=${
        record.isBasketOrder
      } amcOrderIds=${JSON.stringify(
        amcOrderIds
      )} bankAccountOldId=${bankAccountOldId}`
    );

    const paymentPayload = {
      amc_order_ids: amcOrderIds,
      payment_postback_url: postbackUrl,
      method: "UPI",
      provider_name: "ONDC",
      bank_account_id: bankAccountOldId,
    };
    console.log("Payment payload", paymentPayload);
    const fpPayment = await createFpPaymentNetbanking(paymentPayload);
    console.log(
      `  [5/7] ✅ fpPaymentId=${fpPayment.id} tokenUrl=${fpPayment.token_url}`
    );

    /* ---------- STEP 6: PATCH STATE=CONFIRMED ---------- */
    // After payment is created (orders now in payment_pending), patch confirmed.
    let confirmedState = "confirmed";
    let updatedBasketOrders = record.basketOrders ?? [];

    if (record.isBasketOrder) {
      const basketOrderIds = (record.basketOrders ?? []).map(
        (o) => o.fpPurchaseId
      );
      console.log(
        `  [6/7] [BASKET] Patching state=confirmed on ${basketOrderIds.length} order(s):`,
        JSON.stringify(basketOrderIds)
      );
      const results = await Promise.allSettled(
        (record.basketOrders ?? []).map((o) =>
          patchFpPurchase(o.fpPurchaseId, { state: "confirmed" })
        )
      );
      console.log(
        `  [6/7] Confirm results:`,
        JSON.stringify(
          results.map((r) => ({
            status: r.status,
            state: r.value?.state,
            reason: r.reason?.message,
          }))
        )
      );

      // Build updated basketOrders with latest fpState from FP confirm results
      updatedBasketOrders = (record.basketOrders ?? []).map((o, i) => ({
        ...o.toObject(),
        fpState: results[i]?.value?.state ?? o.fpState,
      }));

      confirmedState =
        results.find((r) => r.status === "fulfilled")?.value?.state ??
        "confirmed";
      console.log(
        `  [6/7] ✅ Basket orders confirmed — state=${confirmedState}`
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
      tokenUrl: fpPayment.token_url ?? null,
      fpState: confirmedState ?? "confirmed",
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
    console.log(`  [7/7] ✅ Done — tokenUrl=${updated.tokenUrl}`);

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
    if (!phone) {
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
