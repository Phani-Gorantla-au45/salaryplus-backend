import nodemailer from "nodemailer";

const BRAND       = "Bharat Wealth";
const BRAND_COLOR = "#1B2B5E";
const GOLD        = "#C9A84C";
const BATCH_SIZE  = 20;   // emails per batch
const BATCH_DELAY = 1000; // ms between batches

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
/*  Wrap admin-composed body in the brand email shell.                  */
/*  body can be plain text or HTML — if plain text, newlines become     */
/*  <br/> tags automatically.                                           */
/* ------------------------------------------------------------------ */
export const buildCampaignHtml = (subject, body) => {
  const isHtml  = /<[a-z][\s\S]*>/i.test(body);
  const bodyHtml = isHtml ? body : body.replace(/\n/g, "<br/>");

  return `<!DOCTYPE html>
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
          <td style="padding:32px;color:#374151;font-size:15px;line-height:1.8">
            ${bodyHtml}
          </td>
        </tr>

        <!-- SIGNATURE -->
        <tr>
          <td style="padding:0 32px 28px">
            <hr style="border:none;border-top:1px solid #E8ECF4;margin:0 0 24px"/>
            <table cellpadding="0" cellspacing="0" border="0">
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
            </table>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#F4F6FB;padding:16px 32px;text-align:center">
            <p style="margin:0;font-size:11px;color:#9CA3AF">
              © ${new Date().getFullYear()} ${BRAND}. All rights reserved.<br/>
              You are receiving this as a registered investor on ${BRAND}.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

/* ------------------------------------------------------------------ */
/*  Send to a single address.                                           */
/* ------------------------------------------------------------------ */
export const sendOneCampaignEmail = async (to, subject, html, textBody) => {
  await getTransporter().sendMail({
    from:    `"${BRAND}" <${process.env.SMTP_FROM}>`,
    to,
    subject,
    text:    textBody || subject,
    html,
  });
};

/* ------------------------------------------------------------------ */
/*  Send to a list of { email, name } in BATCH_SIZE batches.           */
/*  Returns { delivered, failed: [email] }                             */
/* ------------------------------------------------------------------ */
export const sendBatchCampaign = async (recipients, subject, html, textBody) => {
  const transporter = getTransporter();
  let delivered = 0;
  const failed  = [];

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);

    await Promise.allSettled(
      batch.map(({ email }) =>
        transporter.sendMail({
          from:    `"${BRAND}" <${process.env.SMTP_FROM}>`,
          to:      email,
          subject,
          text:    textBody || subject,
          html,
        })
      )
    ).then((results) => {
      results.forEach((r, idx) => {
        if (r.status === "fulfilled") {
          delivered++;
        } else {
          console.error(`❌ [BROADCAST] Failed to send to ${batch[idx].email}:`, r.reason?.message);
          failed.push(batch[idx].email);
        }
      });
    });

    if (i + BATCH_SIZE < recipients.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY));
    }
  }

  return { delivered, failed };
};
