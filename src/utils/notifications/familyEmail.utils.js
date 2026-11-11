import nodemailer from "nodemailer";

/* ------------------------------------------------------------------ */
/*  Family linking — notification email to the MEMBER                   */
/*  Sent when someone starts viewing their portfolio, so a link made    */
/*  without their knowledge is noticed and can be removed.              */
/* ------------------------------------------------------------------ */
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

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const sendFamilyLinkedEmail = async ({ to, memberName, viewerName, viewerPhoneMasked }) => {
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
            <p style="margin:4px 0 0;font-size:12px;color:${GOLD};letter-spacing:2px;text-transform:uppercase">Family Portfolio</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px">
            <p style="color:#111;font-size:15px;margin:0 0 14px">Dear ${esc(memberName || "Investor")},</p>
            <p style="color:#444;font-size:14px;line-height:22px;margin:0 0 14px">
              <strong>${esc(viewerName || "A Bharat Wealth user")}</strong> (${esc(viewerPhoneMasked)}) can now view your
              mutual fund and bond portfolio and transactions in the Bharat Wealth app. This was approved with the OTP sent to your registered mobile number.
            </p>
            <p style="color:#444;font-size:14px;line-height:22px;margin:0 0 14px">
              They cannot see your bank details or KYC documents. Any order on your account still needs an OTP sent to your mobile.
            </p>
            <p style="color:#B91C1C;font-size:14px;line-height:22px;margin:0">
              If you did not approve this, open the app → Account → Family → <strong>Who can see my portfolio</strong> and remove access.
            </p>
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
    subject: `${viewerName || "Someone"} can now view your portfolio — ${BRAND}`,
    text:    `${viewerName || "A Bharat Wealth user"} (${viewerPhoneMasked}) can now view your mutual fund and bond portfolio in the Bharat Wealth app. If you did not approve this, open Account → Family → Who can see my portfolio and remove access.`,
    html,
  });
};
