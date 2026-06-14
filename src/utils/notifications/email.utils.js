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

/* ================================================================
 * BOND KYC — USER CONFIRMATION EMAIL
 * ================================================================ */
export const sendBondKycReceivedEmail = async ({ to, userName }) => {
  const displayName = userName?.trim() || "Investor";
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#F4F6FB;font-family:'Helvetica Neue',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6FB;padding:32px 0">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">

        <!-- Header -->
        <tr>
          <td style="background:${BRAND_COLOR};padding:24px 32px">
            <p style="margin:0;font-size:22px;font-weight:800;color:#fff;letter-spacing:1px">${BRAND}</p>
            <p style="margin:4px 0 0;font-size:12px;color:${GOLD};letter-spacing:2px;text-transform:uppercase">Wealth · Done Right</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 32px">
            <h2 style="color:${BRAND_COLOR};font-size:20px;margin:0 0 12px">Bond KYC Received ✅</h2>
            <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 20px">
              Dear <strong>${displayName}</strong>,
            </p>
            <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 20px">
              We have successfully received your Bond KYC documents. Our team will review your submission and it will be approved by <strong>BSE</strong> within <strong>1–2 business days</strong>.
            </p>

            <!-- Status box -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px">
              <tr>
                <td style="background:#F0F4FF;border-left:4px solid ${BRAND_COLOR};border-radius:6px;padding:16px 20px">
                  <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:${BRAND_COLOR};text-transform:uppercase;letter-spacing:1px">What happens next?</p>
                  <ul style="margin:0;padding-left:18px;color:#374151;font-size:14px;line-height:1.8">
                    <li>Your documents are being reviewed by our team</li>
                    <li>BSE approval typically takes <strong>1–2 business days</strong></li>
                    <li>You will receive an email once your KYC is approved</li>
                    <li>After approval, you can start investing in bonds</li>
                  </ul>
                </td>
              </tr>
            </table>

            <p style="color:#6B7280;font-size:13px;line-height:1.6;margin:0">
              If you have any questions, reply to this email or contact us at
              <a href="mailto:support@bharatwealth.app" style="color:${BRAND_COLOR}">support@bharatwealth.app</a>.
            </p>
          </td>
        </tr>

        <!-- Footer -->
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
    from:    `"${BRAND}" <${process.env.SMTP_FROM}>`,
    to,
    subject: `Bond KYC Received — ${BRAND}`,
    text:    `Dear ${displayName}, we have received your Bond KYC documents. BSE approval takes 1–2 business days. We will notify you once approved.`,
    html,
  });
};

/* ================================================================
 * BOND KYC — ADMIN NOTIFICATION WITH DOCUMENTS
 * ================================================================ */
/* ================================================================
 * BOND KYC — APPROVED EMAIL TO USER
 * ================================================================ */
export const sendBondKycApprovedEmail = async ({ to, userName }) => {
  const displayName = userName?.trim() || "Investor";
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#F4F6FB;font-family:'Helvetica Neue',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6FB;padding:32px 0">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">

        <!-- Header -->
        <tr>
          <td style="background:${BRAND_COLOR};padding:24px 32px">
            <p style="margin:0;font-size:22px;font-weight:800;color:#fff;letter-spacing:1px">${BRAND}</p>
            <p style="margin:4px 0 0;font-size:12px;color:${GOLD};letter-spacing:2px;text-transform:uppercase">Wealth · Done Right</p>
          </td>
        </tr>

        <!-- Green approved banner -->
        <tr>
          <td style="background:#ECFDF5;padding:20px 32px;text-align:center;border-bottom:2px solid #D1FAE5">
            <p style="margin:0;font-size:28px">✅</p>
            <p style="margin:8px 0 0;font-size:18px;font-weight:800;color:#065F46">Bond KYC Approved!</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px">
            <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 16px">
              Dear <strong>${displayName}</strong>,
            </p>
            <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 20px">
              Great news! Your Bond KYC has been <strong style="color:#065F46">approved by BSE</strong>.
              You can now start investing in bonds on <strong>${BRAND}</strong>.
            </p>

            <!-- What you can do box -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px">
              <tr>
                <td style="background:#F0F4FF;border-left:4px solid ${BRAND_COLOR};border-radius:6px;padding:16px 20px">
                  <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:${BRAND_COLOR};text-transform:uppercase;letter-spacing:1px">You can now</p>
                  <ul style="margin:0;padding-left:18px;color:#374151;font-size:14px;line-height:2">
                    <li>Browse available bonds on the app</li>
                    <li>Invest in government &amp; corporate bonds</li>
                    <li>Track your bond portfolio and payouts</li>
                    <li>Earn fixed returns on your investment</li>
                  </ul>
                </td>
              </tr>
            </table>

            <p style="color:#6B7280;font-size:13px;line-height:1.6;margin:0">
              If you have any questions, contact us at
              <a href="mailto:support@bharatwealth.app" style="color:${BRAND_COLOR}">support@bharatwealth.app</a>.
            </p>
          </td>
        </tr>

        <!-- Footer -->
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
    from:    `"${BRAND}" <${process.env.SMTP_FROM}>`,
    to,
    subject: `Your Bond KYC is Approved — ${BRAND}`,
    text:    `Dear ${displayName}, your Bond KYC has been approved by BSE. You can now start investing in bonds on ${BRAND}. Open the app to get started.`,
    html,
  });
};

/* ================================================================
 * BOND KYC — DOCUMENTS NOTIFICATION TO ADMIN
 * ================================================================ */
export const sendBondKycDocsToAdmin = async ({
  userName,
  mobile,
  email,
  panNumber,
  panFileUrl,
  addressProofType,
  addressProofUrl,
  bankProofUrl,
  dematProofUrl,
  userUniqueId,
}) => {
  const displayName = userName?.trim() || "—";
  const submittedAt = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

  const docRow = (label, url) => `
    <tr>
      <td style="padding:10px 16px;font-size:14px;color:#374151;border-bottom:1px solid #F3F4F6;width:160px;font-weight:600">${label}</td>
      <td style="padding:10px 16px;font-size:14px;border-bottom:1px solid #F3F4F6">
        <a href="${url}" style="color:${BRAND_COLOR};word-break:break-all">${url}</a>
      </td>
    </tr>`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#F4F6FB;font-family:'Helvetica Neue',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6FB;padding:32px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">

        <!-- Header -->
        <tr>
          <td style="background:${BRAND_COLOR};padding:24px 32px">
            <p style="margin:0;font-size:22px;font-weight:800;color:#fff;letter-spacing:1px">${BRAND} — Admin</p>
            <p style="margin:4px 0 0;font-size:12px;color:${GOLD};letter-spacing:2px;text-transform:uppercase">New Bond KYC Submission</p>
          </td>
        </tr>

        <!-- User Details -->
        <tr>
          <td style="padding:28px 32px 0">
            <h3 style="color:${BRAND_COLOR};font-size:15px;margin:0 0 14px;text-transform:uppercase;letter-spacing:1px">User Details</h3>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:8px;overflow:hidden">
              <tr style="background:#F9FAFB">
                <td style="padding:10px 16px;font-size:14px;color:#374151;border-bottom:1px solid #F3F4F6;width:160px;font-weight:600">Name</td>
                <td style="padding:10px 16px;font-size:14px;color:#111827;border-bottom:1px solid #F3F4F6">${displayName}</td>
              </tr>
              <tr>
                <td style="padding:10px 16px;font-size:14px;color:#374151;border-bottom:1px solid #F3F4F6;font-weight:600">Mobile</td>
                <td style="padding:10px 16px;font-size:14px;color:#111827;border-bottom:1px solid #F3F4F6">${mobile || "—"}</td>
              </tr>
              <tr style="background:#F9FAFB">
                <td style="padding:10px 16px;font-size:14px;color:#374151;border-bottom:1px solid #F3F4F6;font-weight:600">Email</td>
                <td style="padding:10px 16px;font-size:14px;color:#111827;border-bottom:1px solid #F3F4F6">${email || "—"}</td>
              </tr>
              <tr>
                <td style="padding:10px 16px;font-size:14px;color:#374151;border-bottom:1px solid #F3F4F6;font-weight:600">PAN</td>
                <td style="padding:10px 16px;font-size:14px;color:#111827;border-bottom:1px solid #F3F4F6"><strong>${panNumber}</strong></td>
              </tr>
              <tr style="background:#F9FAFB">
                <td style="padding:10px 16px;font-size:14px;color:#374151;border-bottom:1px solid #F3F4F6;font-weight:600">Address Proof</td>
                <td style="padding:10px 16px;font-size:14px;color:#111827;border-bottom:1px solid #F3F4F6">${addressProofType}</td>
              </tr>
              <tr>
                <td style="padding:10px 16px;font-size:14px;color:#374151;font-weight:600">Submitted At</td>
                <td style="padding:10px 16px;font-size:14px;color:#111827">${submittedAt} IST</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Document Links -->
        <tr>
          <td style="padding:24px 32px 0">
            <h3 style="color:${BRAND_COLOR};font-size:15px;margin:0 0 14px;text-transform:uppercase;letter-spacing:1px">Documents</h3>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:8px;overflow:hidden">
              ${docRow("PAN Card", panFileUrl)}
              ${docRow(addressProofType === "AADHAAR" ? "Masked Aadhaar" : addressProofType === "DL" ? "Driving Licence" : "Voter ID", addressProofUrl)}
              ${docRow("Bank Proof", bankProofUrl)}
              ${docRow("Demat CMR/CML", dematProofUrl)}
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 32px;text-align:center">
            <p style="margin:0;font-size:11px;color:#9CA3AF">User ID: ${userUniqueId} &nbsp;|&nbsp; © ${new Date().getFullYear()} ${BRAND}</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await getTransporter().sendMail({
    from:    `"${BRAND} Admin" <${process.env.SMTP_FROM}>`,
    to:      process.env.SMTP_USER,
    cc:      "phanigorantla531@gmail.com",
    subject: `Bond KYC Submission — ${displayName} (${panNumber})`,
    text:    `New Bond KYC from ${displayName} | Mobile: ${mobile || "—"} | Email: ${email || "—"} | PAN: ${panNumber}\n\nPAN: ${panFileUrl}\nAddress (${addressProofType}): ${addressProofUrl}\nBank Proof: ${bankProofUrl}\nDemat: ${dematProofUrl}`,
    html,
  });
};

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
    bcc:     "support@bharatwealth.app",
    subject: `Your ${BRAND} Verification Code`,
    text:    `Your OTP is ${otp}. It expires in 10 minutes. Do not share it with anyone.`,
    html,
  });
};
