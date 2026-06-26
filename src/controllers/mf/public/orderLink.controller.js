import AdminOrderLink from "../../../models/mf/adminOrderLink.model.js";
import MfPurchase from "../../../models/mf/purchase/mfPurchase.model.js";
import MfUserData from "../../../models/mf/mfUserData.model.js";
import RegistrationUser from "../../../models/user/user.model.js";

import {
  patchFpPurchase,
  createFpPaymentNetbanking,
  createFpPaymentUpi,
  fetchFpPayment,
} from "../../../utils/mf/purchase/purchase.utils.js";
import { patchFpBatchPurchase } from "../../../utils/mf/purchase/batchPurchase.utils.js";
import { generateOtp, otpExpiresAt, sendConsentOtp, verifyConsentOtp } from "../../../utils/mf/consent.utils.js";

/**
 * Public, token-secured mirror of the existing OTP-consent → payment flow
 * (mfPurchase.controller.js confirmPurchase), reachable without any app
 * login. Reuses the exact same FP utilities and the exact same MfPurchase
 * collection — this file does not alter the existing authenticated flow
 * in any way, it's a fully separate entry point for admin-shared links.
 */

const LINK_NOT_FOUND = { success: false, message: "This payment link is invalid or has expired" };

const loadLink = async (token) => {
  const link = await AdminOrderLink.findOne({ shareToken: token });
  if (!link) return null;
  if (link.expiresAt < new Date() && link.status !== "completed") {
    if (link.status !== "expired") {
      link.status = "expired";
      await link.save();
    }
  }
  return link;
};

/* ================================================================
 * GET /api/mf/pay/:token
 * Serves the standalone payment page (vanilla HTML/JS, no app needed).
 * ================================================================ */
export const renderOrderLinkPage = async (req, res) => {
  const { token } = req.params;
  res.set("Content-Type", "text/html");
  return res.send(PAGE_HTML.replace("__TOKEN__", token));
};

/* ================================================================
 * GET /api/mf/pay/:token/status
 * Order summary for display on the page.
 * ================================================================ */
export const getOrderLinkStatus = async (req, res) => {
  try {
    const link = await loadLink(req.params.token);
    if (!link) return res.status(404).json(LINK_NOT_FOUND);
    if (link.status === "expired") return res.status(410).json({ success: false, message: "This payment link has expired" });
    if (link.status === "cancelled") return res.status(410).json({ success: false, message: "This payment link was cancelled" });

    const [purchase, user] = await Promise.all([
      MfPurchase.findById(link.purchaseId).lean(),
      RegistrationUser.findOne({ uniqueId: link.uniqueId }, { First_name: 1, Last_name: 1, phone: 1 }).lean(),
    ]);

    if (!purchase) return res.status(404).json(LINK_NOT_FOUND);

    return res.status(200).json({
      success: true,
      data: {
        status: link.status,
        investorName: [user?.First_name, user?.Last_name].filter(Boolean).join(" ") || "Investor",
        phoneMasked: user?.phone ? `${user.phone.slice(0, 3)}****${user.phone.slice(-3)}` : null,
        amount: purchase.amount,
        isBasketOrder: purchase.isBasketOrder,
        funds: purchase.isBasketOrder
          ? purchase.basketFunds.map((f) => ({ isin: f.isin, amount: f.amount }))
          : [{ isin: purchase.isin, schemeName: purchase.schemeName, fundName: purchase.fundName, amount: purchase.amount }],
        paymentMethod: purchase.paymentMethod,
        consentGiven: purchase.consentGiven,
        tokenUrl: purchase.tokenUrl ?? null,
        upiUri: purchase.upiUri ?? null,
        fpState: purchase.fpState,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ================================================================
 * POST /api/mf/pay/:token/send-otp
 * ================================================================ */
export const sendOrderLinkOtp = async (req, res) => {
  try {
    const link = await loadLink(req.params.token);
    if (!link) return res.status(404).json(LINK_NOT_FOUND);
    if (["expired", "cancelled", "completed"].includes(link.status)) {
      return res.status(410).json({ success: false, message: `This link is ${link.status}` });
    }

    const purchase = await MfPurchase.findById(link.purchaseId);
    if (!purchase) return res.status(404).json(LINK_NOT_FOUND);
    if (purchase.consentGiven) {
      return res.status(400).json({ success: false, message: "Consent already given for this order" });
    }

    const mfData = await MfUserData.findOne({ uniqueId: link.uniqueId });
    let phone = mfData?.phone?.number;
    if (!phone) {
      const user = await RegistrationUser.findOne({ uniqueId: link.uniqueId });
      phone = user?.phone;
    }
    if (!phone) {
      return res.status(400).json({ success: false, message: "No phone number on file for this investor" });
    }

    const otp = generateOtp();
    const expiry = otpExpiresAt();
    await sendConsentOtp(phone, otp);

    await MfPurchase.updateOne({ _id: purchase._id }, { $set: { otpCode: otp, otpExpiresAt: expiry, otpVerified: false } });
    link.status = "otp_sent";
    await link.save();

    return res.status(200).json({
      success: true,
      message: "OTP sent to the investor's registered mobile number",
      otpSentTo: `${phone.slice(0, 3)}****${phone.slice(-3)}`,
      otpExpiresAt: expiry,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ================================================================
 * POST /api/mf/pay/:token/confirm
 * Body: { otp }
 * Mirrors confirmPurchase exactly — verify OTP → patch consent →
 * create payment → confirm — just keyed by share token instead of a
 * logged-in user's JWT, and the bank account is auto-resolved from the
 * investor's on-file primary account rather than collected on this page.
 * ================================================================ */
export const confirmOrderLinkPayment = async (req, res) => {
  try {
    const link = await loadLink(req.params.token);
    if (!link) return res.status(404).json(LINK_NOT_FOUND);
    if (["expired", "cancelled", "completed"].includes(link.status)) {
      return res.status(410).json({ success: false, message: `This link is ${link.status}` });
    }

    const { otp } = req.body;
    if (!otp) return res.status(400).json({ success: false, message: "otp is required" });

    const record = await MfPurchase.findById(link.purchaseId).select("+otpCode");
    if (!record) return res.status(404).json(LINK_NOT_FOUND);
    if (record.consentGiven) {
      return res.status(400).json({ success: false, message: "Consent already given for this order" });
    }

    const { valid, reason } = verifyConsentOtp(otp, record.otpCode, record.otpExpiresAt);
    if (!valid) return res.status(400).json({ success: false, message: reason });

    const mfData = await MfUserData.findOne({ uniqueId: link.uniqueId });
    let phone = mfData?.phone?.number;
    let email = mfData?.email?.email;
    if (!phone || !email) {
      const user = await RegistrationUser.findOne({ uniqueId: link.uniqueId });
      if (!phone) phone = user?.phone;
      if (!email) email = user?.email;
    }
    if (!phone || !email) {
      return res.status(400).json({ success: false, message: "Phone and email are required for consent" });
    }

    const bankAccountOldId = mfData?.bankAccount?.fpBankAccountOldId;
    if (!bankAccountOldId) {
      return res.status(400).json({ success: false, message: "No bank account on file for this investor" });
    }

    const isd = mfData?.phone?.isd || "91";
    const consentPayload = { email, isd_code: isd, mobile: phone };

    if (record.isBasketOrder) {
      const orders = record.basketOrders ?? [];
      await Promise.all(orders.map((o) => patchFpPurchase(o.fpPurchaseId, { consent: consentPayload })));
    } else {
      await patchFpPurchase(record.fpPurchaseId, { consent: consentPayload });
    }

    await MfPurchase.updateOne(
      { _id: record._id },
      { $set: { otpVerified: true, consentGiven: true, consentAt: new Date(), otpCode: null } },
    );
    link.status = "otp_verified";
    await link.save();

    const postbackUrl = `${process.env.APP_URL}/api/mf/purchase/payment-callback`;
    const amcOrderIds = record.isBasketOrder ? record.fpOldIds ?? [] : [record.fpOldId];
    const isUpi = record.paymentMethod === "UPI";

    const basePaymentPayload = {
      amc_order_ids: amcOrderIds,
      payment_postback_url: postbackUrl,
      provider_name: "ONDC",
      bank_account_id: Number(bankAccountOldId),
    };

    let fpPayment;
    if (isUpi) {
      fpPayment = await createFpPaymentUpi(basePaymentPayload);
    } else {
      fpPayment = await createFpPaymentNetbanking({ ...basePaymentPayload, method: "NETBANKING" });
    }

    let confirmedState = "confirmed";
    let updatedBasketOrders = record.basketOrders ?? [];

    if (record.isBasketOrder) {
      const orders = record.basketOrders ?? [];
      const batchResults = await patchFpBatchPurchase(orders.map((o) => ({ id: o.fpPurchaseId, state: "confirmed" })));
      updatedBasketOrders = orders.map((o, i) => ({ ...o.toObject(), fpState: batchResults[i]?.state ?? o.fpState }));
      confirmedState = batchResults[0]?.state ?? "confirmed";
    } else {
      const confirmedFpData = await patchFpPurchase(record.fpPurchaseId, { state: "confirmed" });
      confirmedState = confirmedFpData.state ?? "confirmed";
    }

    const dbUpdate = {
      fpPaymentId: fpPayment.id ?? null,
      tokenUrl: fpPayment.token_url ?? null,
      fpState: confirmedState ?? "confirmed",
      rawPaymentResponse: fpPayment,
    };
    if (record.isBasketOrder) dbUpdate.basketOrders = updatedBasketOrders;

    const updated = await MfPurchase.findOneAndUpdate({ _id: record._id }, { $set: dbUpdate }, { new: true });

    link.status = "payment_created";
    await link.save();

    return res.status(200).json({
      success: true,
      message: isUpi ? "Confirmed. Open your UPI app to complete payment." : "Confirmed. Redirecting to payment.",
      data: {
        fpState: updated.fpState,
        paymentMethod: record.paymentMethod,
        tokenUrl: updated.tokenUrl,
        upiUri: updated.upiUri,
      },
    });
  } catch (err) {
    console.error("❌ [PUBLIC ORDER LINK] Confirm error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ================================================================
 * GET /api/mf/pay/:token/payment-status
 * ================================================================ */
export const getOrderLinkPaymentStatus = async (req, res) => {
  try {
    const link = await loadLink(req.params.token);
    if (!link) return res.status(404).json(LINK_NOT_FOUND);

    const record = await MfPurchase.findById(link.purchaseId);
    if (!record) return res.status(404).json(LINK_NOT_FOUND);
    if (!record.fpPaymentId) {
      return res.status(400).json({ success: false, message: "Payment not yet initiated" });
    }

    const fpPayment = await fetchFpPayment(record.fpPaymentId);
    const upiUri = fpPayment?.upi?.uri ?? record.upiUri ?? null;
    if (upiUri && !record.upiUri) {
      await MfPurchase.updateOne({ _id: record._id }, { $set: { upiUri } });
    }

    if (fpPayment.status === "SUCCESS" && link.status !== "completed") {
      link.status = "completed";
      await link.save();
    }

    return res.status(200).json({
      success: true,
      data: {
        status: fpPayment.status, // PENDING | SUCCESS | FAILED
        amount: fpPayment.amount,
        tokenUrl: record.tokenUrl ?? null,
        upiUri,
        failedReason: fpPayment.failed_reason ?? null,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  Standalone payment page — vanilla HTML/JS, no build step, no app.  */
/* ------------------------------------------------------------------ */
const PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Complete Your Investment — Bharat Wealth</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; background: #F4F6FB; padding: 24px 16px; color: #111827; }
  .card { background: #fff; border-radius: 16px; padding: 24px; max-width: 420px; margin: 0 auto; box-shadow: 0 2px 12px rgba(0,0,0,.06); }
  .brand { font-size: 13px; font-weight: 800; color: #1B2B5E; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 16px; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .sub { color: #6B7280; font-size: 13px; margin-bottom: 20px; }
  .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #F3F4F6; font-size: 14px; }
  .row span:first-child { color: #6B7280; }
  .row span:last-child { font-weight: 700; }
  .amt { font-size: 28px; font-weight: 800; color: #1B2B5E; margin: 16px 0 4px; }
  input { width: 100%; padding: 14px; border: 1.5px solid #E5E7EB; border-radius: 10px; font-size: 18px; text-align: center; letter-spacing: 4px; margin: 12px 0; }
  button { width: 100%; padding: 14px; border: none; border-radius: 10px; background: #1B2B5E; color: #fff; font-size: 15px; font-weight: 700; cursor: pointer; margin-top: 8px; }
  button:disabled { opacity: 0.5; }
  .msg { margin-top: 14px; font-size: 13px; padding: 10px; border-radius: 8px; }
  .msg.error { background: #FEF2F2; color: #B91C1C; }
  .msg.ok { background: #ECFDF5; color: #065F46; }
  .hidden { display: none; }
  .loading { text-align: center; color: #9CA3AF; padding: 40px 0; }
</style>
</head>
<body>
  <div class="card" id="app">
    <div class="loading" id="loading">Loading order details…</div>
  </div>

<script>
const TOKEN = "__TOKEN__";
const app = document.getElementById("app");

async function api(path, opts) {
  const res = await fetch("/api/mf/pay/" + TOKEN + path, {
    method: opts?.method || "GET",
    headers: { "Content-Type": "application/json" },
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Something went wrong");
  return data;
}

function render(html) { app.innerHTML = html; }

function fundsList(data) {
  return data.funds.map(f =>
    '<div class="row"><span>' + (f.fundName || f.isin) + '</span><span>₹' + f.amount.toLocaleString("en-IN") + '</span></div>'
  ).join("");
}

async function init() {
  try {
    const { data } = await api("/status");

    if (data.status === "completed" || data.fpState === "successful") {
      render(
        '<div class="brand">Bharat Wealth</div><h1>✅ Payment Complete</h1>' +
        '<p class="sub">Your investment has been processed successfully.</p>'
      );
      return;
    }

    render(
      '<div class="brand">Bharat Wealth</div>' +
      '<h1>Complete Your Investment</h1>' +
      '<p class="sub">Hi ' + data.investorName + ', review and confirm below.</p>' +
      '<div class="amt">₹' + data.amount.toLocaleString("en-IN") + '</div>' +
      fundsList(data) +
      '<div id="step"></div>'
    );

    const step = document.getElementById("step");

    if (data.consentGiven && data.tokenUrl) {
      step.innerHTML = '<button onclick="window.location.href=\\'' + data.tokenUrl + '\\'">Proceed to Payment →</button>';
      return;
    }
    if (data.consentGiven && data.upiUri) {
      step.innerHTML =
        '<button onclick="window.location.href=\\'' + data.upiUri + '\\'">Open UPI App →</button>' +
        '<div class="msg ok" id="pollMsg">Waiting for payment confirmation…</div>';
      pollPayment();
      return;
    }

    step.innerHTML =
      '<button id="sendOtpBtn">Send OTP to Registered Mobile</button>' +
      '<div id="otpArea" class="hidden">' +
        '<input id="otpInput" maxlength="6" inputmode="numeric" placeholder="Enter OTP" />' +
        '<button id="confirmBtn">Confirm & Continue</button>' +
      '</div>' +
      '<div id="msg"></div>';

    document.getElementById("sendOtpBtn").onclick = sendOtp;
  } catch (err) {
    render('<div class="brand">Bharat Wealth</div><h1>Link Unavailable</h1><p class="msg error">' + err.message + '</p>');
  }
}

async function sendOtp() {
  const btn = document.getElementById("sendOtpBtn");
  const msg = document.getElementById("msg");
  btn.disabled = true;
  try {
    const { otpSentTo } = await api("/send-otp", { method: "POST" });
    document.getElementById("otpArea").classList.remove("hidden");
    msg.innerHTML = '<div class="msg ok">OTP sent to ' + otpSentTo + '</div>';
    document.getElementById("confirmBtn").onclick = confirmPayment;
    btn.remove();
  } catch (err) {
    msg.innerHTML = '<div class="msg error">' + err.message + '</div>';
    btn.disabled = false;
  }
}

async function confirmPayment() {
  const otp = document.getElementById("otpInput").value.trim();
  const msg = document.getElementById("msg");
  const btn = document.getElementById("confirmBtn");
  if (!otp) { msg.innerHTML = '<div class="msg error">Enter the OTP</div>'; return; }
  btn.disabled = true;
  btn.textContent = "Confirming…";
  try {
    const { data } = await api("/confirm", { method: "POST", body: { otp } });
    if (data.tokenUrl) {
      window.location.href = data.tokenUrl;
    } else if (data.upiUri) {
      window.location.href = data.upiUri;
      msg.innerHTML = '<div class="msg ok">Waiting for payment confirmation…</div>';
      pollPayment();
    }
  } catch (err) {
    msg.innerHTML = '<div class="msg error">' + err.message + '</div>';
    btn.disabled = false;
    btn.textContent = "Confirm & Continue";
  }
}

async function pollPayment() {
  try {
    const { data } = await api("/payment-status");
    const el = document.getElementById("pollMsg") || document.getElementById("msg");
    if (data.status === "SUCCESS") {
      if (el) el.innerHTML = '<div class="msg ok">✅ Payment successful!</div>';
      return;
    }
    if (data.status === "FAILED") {
      if (el) el.innerHTML = '<div class="msg error">Payment failed: ' + (data.failedReason || "please try again") + '</div>';
      return;
    }
    setTimeout(pollPayment, 4000);
  } catch {
    setTimeout(pollPayment, 5000);
  }
}

init();
</script>
</body>
</html>`;
