import nodemailer from "nodemailer";
import MfUserData from "../../../models/mf/mfUserData.model.js";
import User from "../../../models/user/user.model.js";

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

/**
 * Resolve user email from uniqueId.
 * Tries MfUserData first (fp email), falls back to User (auth email).
 * @param {string} uniqueId
 * @returns {string|null}
 */
export const resolveUserEmail = async (uniqueId) => {
  if (!uniqueId) return null;

  const mfData = await MfUserData.findOne({ uniqueId }).select("email").lean();
  if (mfData?.email?.email) return mfData.email.email;

  const user = await User.findOne({ uniqueId }).select("email").lean();
  return user?.email || null;
};

/**
 * Resolve user name from uniqueId.
 * @param {string} uniqueId
 * @returns {string}
 */
export const resolveUserName = async (uniqueId) => {
  if (!uniqueId) return "Investor";

  const mfData = await MfUserData.findOne({ uniqueId }).select("investorProfile").lean();
  if (mfData?.investorProfile?.name) return mfData.investorProfile.name;

  const user = await User.findOne({ uniqueId }).select("First_name Last_name").lean();
  if (user?.First_name) return `${user.First_name} ${user.Last_name || ""}`.trim();

  return "Investor";
};

/**
 * Send a transactional notification email.
 * @param {object} opts
 * @param {string} opts.to
 * @param {string} opts.subject
 * @param {string} opts.heading
 * @param {string} opts.body       - Plain text message
 * @param {string} [opts.bodyHtml] - Optional custom HTML for the message body
 */
export const sendWebhookNotification = async ({ to, subject, heading, body, bodyHtml }) => {
  if (!to) return;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:8px">
      <div style="background:#4f46e5;padding:16px 24px;border-radius:6px 6px 0 0;margin:-24px -24px 24px">
        <h1 style="color:#fff;font-size:18px;margin:0">SalaryPlus</h1>
      </div>
      <h2 style="color:#1a1a2e;font-size:16px;margin-bottom:8px">${heading}</h2>
      ${bodyHtml || `<p style="color:#374151;line-height:1.6">${body}</p>`}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
      <p style="color:#9ca3af;font-size:12px">This is an automated notification from SalaryPlus. Do not reply to this email.</p>
    </div>
  `;

  await getTransporter().sendMail({
    from:    `"SalaryPlus" <${process.env.SMTP_FROM || "ceo@sipway.in"}>`,
    to,
    subject,
    text:    body,
    html,
  });
};
