import nodemailer from "nodemailer";

const BRAND       = "Bharat Wealth";
const BRAND_COLOR = "#1B2B5E";
const GOLD        = "#C9A84C";

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

export const sendEmailOtp = async (to, otp) => {
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#F4F6FB;font-family:'Helvetica Neue',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6FB;padding:32px 0">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
        <tr>
          <td style="background:${BRAND_COLOR};padding:24px 32px">
            <p style="margin:0;font-size:22px;font-weight:800;color:#fff;letter-spacing:1px">${BRAND}</p>
            <p style="margin:4px 0 0;font-size:12px;color:${GOLD};letter-spacing:2px;text-transform:uppercase">Wealth · Done Right</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;text-align:center">
            <h2 style="color:${BRAND_COLOR};font-size:20px;margin:0 0 8px">Verify Your Email</h2>
            <p style="color:#555;font-size:14px;margin:0 0 28px">Use the OTP below to verify your email address.</p>
            <div style="display:inline-block;background:#F4F6FB;border:2px dashed ${GOLD};border-radius:10px;padding:16px 40px;margin:0 0 24px">
              <span style="font-size:38px;font-weight:800;letter-spacing:12px;color:${BRAND_COLOR}">${otp}</span>
            </div>
            <p style="color:#9CA3AF;font-size:12px;margin:0">Expires in <strong>10 minutes</strong>. Do not share this with anyone.</p>
          </td>
        </tr>
        <tr>
          <td style="background:#F4F6FB;padding:16px 32px;text-align:center">
            <p style="margin:0;font-size:11px;color:#9CA3AF">© ${new Date().getFullYear()} ${BRAND}. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await getTransporter().sendMail({
    from:    `"${BRAND}" <${process.env.SMTP_FROM || "ceo@bharatwealth.in"}>`,
    to,
    subject: `Your ${BRAND} Verification Code`,
    text:    `Your OTP is ${otp}. It expires in 10 minutes. Do not share it with anyone.`,
    html,
  });
};
