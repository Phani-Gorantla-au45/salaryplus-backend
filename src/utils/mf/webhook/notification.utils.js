import nodemailer from "nodemailer";
import MfUserData from "../../../models/mf/mfUserData.model.js";
import User from "../../../models/user/user.model.js";

const BRAND       = "Bharat Wealth";
const BRAND_COLOR = "#1B2B5E";
const GOLD        = "#C9A84C";
const FROM        = () => `"${BRAND}" <${process.env.SMTP_FROM || "ceo@bharatwealth.in"}>`;

const getTransporter = () =>
  nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   Number(process.env.SMTP_PORT) || 465,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

/* ------------------------------------------------------------------ */
/*  Shared building blocks                                              */
/* ------------------------------------------------------------------ */
const signatureHtml = () => `
  <table cellpadding="0" cellspacing="0" border="0" style="margin-top:32px">
    <tr>
      <td style="padding-right:16px;border-right:3px solid ${GOLD};vertical-align:top">
        <p style="margin:0;font-size:15px;font-weight:700;color:${BRAND_COLOR}">Phani</p>
        <p style="margin:4px 0 0;font-size:13px;color:#555">CEO &amp; Founder, ${BRAND}</p>
      </td>
      <td style="padding-left:16px;vertical-align:top">
        <p style="margin:0;font-size:13px;color:#555">📱 <a href="tel:+918801648801" style="color:${BRAND_COLOR};text-decoration:none">+91 88016 48801</a></p>
        <p style="margin:4px 0 0;font-size:13px;color:#555">💬 <a href="https://wa.me/918801648801" style="color:${BRAND_COLOR};text-decoration:none">WhatsApp me anytime</a></p>
      </td>
    </tr>
  </table>`;

const wrapEmail = (bodyHtml) => `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#F4F6FB;font-family:'Helvetica Neue',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6FB;padding:32px 0">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">

        <!-- HEADER -->
        <tr>
          <td style="background:${BRAND_COLOR};padding:24px 32px">
            <p style="margin:0;font-size:22px;font-weight:800;color:#fff;letter-spacing:1px">${BRAND}</p>
            <p style="margin:4px 0 0;font-size:12px;color:${GOLD};letter-spacing:2px;text-transform:uppercase">Wealth · Done Right</p>
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td style="padding:32px">
            ${bodyHtml}
            <hr style="border:none;border-top:1px solid #E8ECF4;margin:28px 0"/>
            ${signatureHtml()}
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#F4F6FB;padding:16px 32px;text-align:center">
            <p style="margin:0;font-size:11px;color:#9CA3AF">
              © ${new Date().getFullYear()} ${BRAND}. All rights reserved.<br/>
              You are receiving this because you are a registered investor.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

/* ------------------------------------------------------------------ */
/*  Resolve helpers                                                     */
/* ------------------------------------------------------------------ */
export const resolveUserEmail = async (uniqueId) => {
  if (!uniqueId) return null;
  const mfData = await MfUserData.findOne({ uniqueId }).select("email").lean();
  if (mfData?.email?.email) return mfData.email.email;
  const user = await User.findOne({ uniqueId }).select("email").lean();
  return user?.email || null;
};

export const resolveUserName = async (uniqueId) => {
  if (!uniqueId) return "Investor";
  const mfData = await MfUserData.findOne({ uniqueId }).select("investorProfile").lean();
  if (mfData?.investorProfile?.name) return mfData.investorProfile.name;
  const user = await User.findOne({ uniqueId }).select("First_name Last_name").lean();
  if (user?.First_name) return `${user.First_name} ${user.Last_name || ""}`.trim();
  return "Investor";
};

/* ------------------------------------------------------------------ */
/*  Generic notification (used by admin alerts, KYC, mandate, etc.)    */
/* ------------------------------------------------------------------ */
export const sendWebhookNotification = async ({ to, subject, heading, body, bodyHtml }) => {
  if (!to) return;

  const html = wrapEmail(`
    <h2 style="color:${BRAND_COLOR};font-size:20px;margin:0 0 16px">${heading}</h2>
    ${bodyHtml || `<p style="color:#374151;font-size:15px;line-height:1.7">${body.replace(/\n/g, "<br/>")}</p>`}
  `);

  await getTransporter().sendMail({
    from: FROM(), to, bcc: "support@bharatwealth.app", subject, text: body, html,
  });
};

/* ------------------------------------------------------------------ */
/*  Founder note — sent on new user registration                        */
/* ------------------------------------------------------------------ */
export const sendFounderNote = async ({ to, name }) => {
  if (!to) return;

  const firstName = (name || "").split(" ")[0] || "there";

  const bodyHtml = `
    <h2 style="color:${BRAND_COLOR};font-size:20px;margin:0 0 20px">
      Welcome to ${BRAND}, ${firstName} 👋
    </h2>

    <p style="color:#374151;font-size:15px;line-height:1.8;margin:0 0 16px">
      I'm Phani, the founder. I wanted to personally reach out and tell you <em>why we built this</em>.
    </p>

    <div style="background:#F4F6FB;border-left:4px solid ${GOLD};padding:16px 20px;border-radius:0 8px 8px 0;margin:0 0 20px">
      <p style="color:#1B2B5E;font-size:15px;line-height:1.8;margin:0;font-style:italic">
        "There are hundreds of investment apps in India today — all of them built for millions of users,
        all of them designed around past returns and DIY choices. We saw a problem: people were buying
        funds, not building wealth."
      </p>
    </div>

    <p style="color:#374151;font-size:15px;line-height:1.8;margin:0 0 16px">
      At <strong>${BRAND}</strong>, we do things differently:
    </p>

    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px">
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #E8ECF4">
          <span style="color:${GOLD};font-size:18px;margin-right:10px">📊</span>
          <strong style="color:${BRAND_COLOR}">We build Portfolios, not just fund lists</strong><br/>
          <span style="color:#555;font-size:13px;line-height:1.6">Proper asset allocation aligned to your life goals — not just past returns.</span>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #E8ECF4">
          <span style="color:${GOLD};font-size:18px;margin-right:10px">🤝</span>
          <strong style="color:${BRAND_COLOR}">We serve a few hundred, not lakhs</strong><br/>
          <span style="color:#555;font-size:13px;line-height:1.6">We deliberately stay small so we can handhold every single investor personally.</span>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #E8ECF4">
          <span style="color:${GOLD};font-size:18px;margin-right:10px">🎯</span>
          <strong style="color:${BRAND_COLOR}">Your goal: ₹1 Crore portfolio — the right way</strong><br/>
          <span style="color:#555;font-size:13px;line-height:1.6">We stay with you for the long journey, not just the first transaction.</span>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0">
          <span style="color:${GOLD};font-size:18px;margin-right:10px">📞</span>
          <strong style="color:${BRAND_COLOR}">Direct access to me and the fund manager</strong><br/>
          <span style="color:#555;font-size:13px;line-height:1.6">One call or WhatsApp — any time. No bots, no tickets.</span>
        </td>
      </tr>
    </table>

    <p style="color:#374151;font-size:15px;line-height:1.8;margin:0">
      I'm excited to be part of your wealth journey. Don't hesitate to reach out directly — I mean it.
    </p>`;

  const html = wrapEmail(bodyHtml);

  await getTransporter().sendMail({
    from:    FROM(),
    to,
    subject: `Welcome to ${BRAND} — A Note from the Founder`,
    text:    `Hi ${firstName},\n\nWelcome to ${BRAND}! I'm Phani, the founder.\n\nWe built ${BRAND} because we believe India needs a wealth platform that builds portfolios — not just sells funds. We serve a few hundred investors, handhold each one personally, and our goal is simple: help you build a ₹1 Crore portfolio the right way.\n\nYou can reach me or our fund manager directly on WhatsApp: +91 88016 48801, any time.\n\nWarm regards,\nPhani\nCEO & Founder, ${BRAND}`,
    html,
  });
};

/* ------------------------------------------------------------------ */
/*  Investment success email — handles single and basket               */
/* ------------------------------------------------------------------ */
export const sendInvestmentSuccessEmail = async ({ to, name, amount, isBasket, funds = [], schemeName }) => {
  if (!to) return;

  const firstName = (name || "").split(" ")[0] || "Investor";
  const fmt       = (n) => `₹${Number(n).toLocaleString("en-IN")}`;

  let contentHtml;

  const allotmentNote = `
    <div style="background:#EFF6FF;border-left:4px solid #3B82F6;border-radius:4px;padding:12px 16px;margin:0 0 16px">
      <p style="margin:0;color:#1E40AF;font-size:13px;line-height:1.7">
        <strong>Note:</strong> Unit allotment typically takes 1–3 business days from the date of investment.
        Once allotted, you can view your holdings in the <strong>Portfolio</strong> section of the app.
      </p>
    </div>`;

  if (isBasket && funds.length > 0) {
    const fundsRows = funds.map((f) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #E8ECF4;color:#374151;font-size:14px">${f.schemeName || f.fundName || f.isin}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #E8ECF4;text-align:right;font-weight:600;color:${BRAND_COLOR};font-size:14px;white-space:nowrap">${fmt(f.amount)}</td>
      </tr>`).join("");

    contentHtml = `
      <h2 style="color:${BRAND_COLOR};font-size:20px;margin:0 0 6px">Portfolio Investment Successful! 🎉</h2>
      <p style="color:#555;font-size:14px;margin:0 0 24px">Hi ${firstName}, your basket investment has been processed.</p>

      <div style="background:#F4F6FB;border-radius:8px;overflow:hidden;margin:0 0 20px">
        <div style="background:${BRAND_COLOR};padding:12px 16px">
          <p style="margin:0;color:#fff;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px">Portfolio Basket</p>
        </div>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr style="background:#E8ECF4">
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6B7280;font-weight:600;text-transform:uppercase">Fund</th>
            <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6B7280;font-weight:600;text-transform:uppercase">Amount</th>
          </tr>
          ${fundsRows}
        </table>
        <div style="background:#1B2B5E0D;padding:10px 12px;display:flex;justify-content:space-between">
          <span style="font-size:14px;font-weight:700;color:${BRAND_COLOR}">Total Invested</span>
          <span style="font-size:14px;font-weight:700;color:${BRAND_COLOR};float:right">${fmt(amount)}</span>
        </div>
      </div>

      ${allotmentNote}`;
  } else {
    contentHtml = `
      <h2 style="color:${BRAND_COLOR};font-size:20px;margin:0 0 6px">Investment Successful! 🎉</h2>
      <p style="color:#555;font-size:14px;margin:0 0 24px">Hi ${firstName}, your investment has been processed.</p>

      <div style="background:#F4F6FB;border-radius:8px;padding:20px 24px;margin:0 0 20px">
        ${schemeName ? `<p style="margin:0 0 12px;font-size:13px;color:#6B7280">${schemeName}</p>` : ""}
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:14px;color:#374151">Amount Invested</span>
          <span style="font-size:26px;font-weight:800;color:${BRAND_COLOR}">${fmt(amount)}</span>
        </div>
      </div>

      ${allotmentNote}`;
  }

  const html = wrapEmail(contentHtml);

  await getTransporter().sendMail({
    from:    FROM(),
    to,
    subject: isBasket ? `Portfolio Investment of ${fmt(amount)} Successful — ${BRAND}` : `Investment of ${fmt(amount)} Successful — ${BRAND}`,
    text:    `Hi ${firstName},\n\nYour${isBasket ? " basket" : ""} investment of ${fmt(amount)} has been successfully processed. Units will be allotted at the applicable NAV.\n\nKeep investing!\n\nPhani\nCEO, ${BRAND}`,
    html,
  });
};

/* ------------------------------------------------------------------ */
/*  Redemption success email                                            */
/* ------------------------------------------------------------------ */
export const sendRedemptionSuccessEmail = async ({ to, name, amount, schemeName }) => {
  if (!to) return;

  const firstName = (name || "").split(" ")[0] || "Investor";
  const fmt       = (n) => n ? `₹${Number(n).toLocaleString("en-IN")}` : "your redemption amount";

  const bodyHtml = `
    <h2 style="color:${BRAND_COLOR};font-size:20px;margin:0 0 6px">Withdrawal Processed ✅</h2>
    <p style="color:#555;font-size:14px;margin:0 0 24px">Hi ${firstName}, your redemption request has been successfully processed.</p>

    <div style="background:#F4F6FB;border-radius:8px;padding:20px 24px;margin:0 0 20px">
      ${schemeName ? `<p style="margin:0 0 12px;font-size:13px;color:#6B7280">${schemeName}</p>` : ""}
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:14px;color:#374151">Amount Redeemed</span>
        <span style="font-size:26px;font-weight:800;color:#059669">${fmt(amount)}</span>
      </div>
    </div>

    <div style="background:#ECFDF5;border:1px solid #6EE7B7;border-radius:8px;padding:14px 18px;margin:0 0 16px">
      <p style="margin:0;color:#065F46;font-size:13px;line-height:1.7">
        💰 Proceeds will be credited to your registered bank account within <strong>2–3 business days</strong>.
      </p>
    </div>

    <p style="color:#555;font-size:13px;line-height:1.7;margin:0">
      If you have any questions about the redemption, feel free to WhatsApp or call me directly.
    </p>`;

  const html = wrapEmail(bodyHtml);

  await getTransporter().sendMail({
    from:    FROM(),
    to,
    subject: `Redemption of ${fmt(amount)} Processed — ${BRAND}`,
    text:    `Hi ${firstName},\n\nYour redemption of ${fmt(amount)} has been successfully processed. Proceeds will be credited to your bank account within 2-3 business days.\n\nPhani\nCEO, ${BRAND}`,
    html,
  });
};
