import nodemailer from "nodemailer";

// Transporter created lazily so env vars are guaranteed to be loaded
const getTransporter = () =>
  nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   Number(process.env.SMTP_PORT) || 465,
    secure: Number(process.env.SMTP_PORT) === 465, // port 465 = SSL, 587 = TLS
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

/**
 * Send an OTP email from ceo@sipway.in
 * @param {string} to   - recipient email address
 * @param {string} otp  - 4-digit OTP
 */
export const sendEmailOtp = async (to, otp) => {
  await getTransporter().sendMail({
    from:    `"SalaryPlus" <${process.env.SMTP_FROM || "ceo@sipway.in"}>`,
    to,
    subject: "Your SalaryPlus Verification Code",
    text:    `Your OTP is ${otp}. It expires in 10 minutes. Do not share it with anyone.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#1a1a2e">Verify your email</h2>
        <p>Use the OTP below to verify your email address on SalaryPlus.</p>
        <div style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#4f46e5;padding:16px 0">${otp}</div>
        <p style="color:#666;font-size:13px">This OTP expires in 10 minutes. Do not share it with anyone.</p>
      </div>
    `,
  });
};
