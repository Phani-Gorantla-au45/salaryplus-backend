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

/* ================================================================
 * GOAL SAVED — USER CONFIRMATION EMAIL
 * ================================================================ */
export const sendGoalSavedEmail = async ({ to, userName, goalLabel, goalName, targetAmount, monthlySip, stepUpSip, chosenPlan }) => {
  const displayName = userName?.trim() || "Investor";
  const fmt = (n) => "₹" + Number(n).toLocaleString("en-IN");
  const chosenSip   = chosenPlan === "step_up_sip" ? stepUpSip : monthlySip;
  const sipLabel    = chosenPlan === "step_up_sip" ? "Step-up SIP (Starting)" : "Monthly SIP";

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#F4F6FB;font-family:'Helvetica Neue',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6FB;padding:32px 0">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">

        <!-- Header -->
        <tr>
          <td style="background:${BRAND_COLOR};padding:24px 32px">
            <p style="margin:0;font-size:22px;font-weight:800;color:#fff;letter-spacing:1px">${BRAND}</p>
            <p style="margin:4px 0 0;font-size:12px;color:${GOLD};letter-spacing:2px;text-transform:uppercase">Wealth · Done Right</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px">
            <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 6px">Dear <strong>${displayName}</strong>,</p>
            <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 24px">
              Your <strong>${goalLabel}</strong> goal has been saved successfully. Here's a summary:
            </p>

            <!-- Goal Summary Card -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFF;border:1px solid #E0E7FF;border-radius:10px;margin:0 0 24px;overflow:hidden">
              <tr>
                <td style="background:${BRAND_COLOR};padding:12px 20px">
                  <p style="margin:0;font-size:14px;font-weight:700;color:#fff;letter-spacing:0.5px">${goalName}</p>
                  <p style="margin:2px 0 0;font-size:11px;color:${GOLD};text-transform:uppercase;letter-spacing:1px">${goalLabel}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:0">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding:16px 20px;border-bottom:1px solid #E0E7FF;width:50%">
                        <p style="margin:0;font-size:11px;color:#6B7280;text-transform:uppercase;letter-spacing:1px">Target Amount</p>
                        <p style="margin:4px 0 0;font-size:20px;font-weight:800;color:${BRAND_COLOR}">${fmt(targetAmount)}</p>
                      </td>
                      <td style="padding:16px 20px;border-bottom:1px solid #E0E7FF;border-left:1px solid #E0E7FF">
                        <p style="margin:0;font-size:11px;color:#6B7280;text-transform:uppercase;letter-spacing:1px">${sipLabel}</p>
                        <p style="margin:4px 0 0;font-size:20px;font-weight:800;color:#065F46">${fmt(chosenSip)}/mo</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Highlight: Next Step -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px">
              <tr>
                <td style="background:linear-gradient(135deg,#FFF9E6 0%,#FFFBF0 100%);border:2px solid ${GOLD};border-radius:10px;padding:20px 24px">
                  <p style="margin:0 0 6px;font-size:13px;font-weight:800;color:#92400E;text-transform:uppercase;letter-spacing:1px">🎯 What's Next?</p>
                  <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#374151">Saving a goal is the first step.</p>
                  <p style="margin:0 0 16px;font-size:14px;color:#4B5563;line-height:1.7">
                    The <strong>most important step</strong> is building the right portfolio for this goal.
                    Our experts can help you pick the best funds, set up a SIP, and keep you on track.
                  </p>
                  <p style="margin:0 0 16px;font-size:14px;color:#4B5563;line-height:1.7">
                    <strong>Connect directly with our founder</strong> — get personalised guidance tailored to your financial goals.
                  </p>
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="background:${BRAND_COLOR};border-radius:6px;padding:12px 24px">
                        <a href="mailto:phanigorantla531@gmail.com?subject=Goal Portfolio Guidance — ${encodeURIComponent(goalName)}"
                           style="color:#fff;font-size:14px;font-weight:700;text-decoration:none;letter-spacing:0.3px">
                          📩 Connect with the Founder
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <p style="color:#6B7280;font-size:13px;line-height:1.6;margin:0">
              You can view and manage your goals anytime in the <strong>${BRAND}</strong> app.
              Questions? Write to us at <a href="mailto:support@bharatwealth.app" style="color:${BRAND_COLOR}">support@bharatwealth.app</a>.
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
    subject: `Your ${goalLabel} Goal is Saved — ${BRAND}`,
    text:    `Dear ${displayName}, your ${goalLabel} goal "${goalName}" has been saved. Target: ${fmt(targetAmount)} | ${sipLabel}: ${fmt(chosenSip)}/mo. Open the app to start building your portfolio.`,
    html,
  });
};

/* ================================================================
 * GOAL SAVED — ADMIN NOTIFICATION
 * ================================================================ */
export const sendGoalSavedToAdmin = async ({ userName, mobile, email, goalLabel, goalName, targetAmount, monthlySip, stepUpSip, chosenPlan, userUniqueId }) => {
  const fmt = (n) => "₹" + Number(n).toLocaleString("en-IN");
  const chosenSip = chosenPlan === "step_up_sip" ? stepUpSip : monthlySip;
  const sipLabel  = chosenPlan === "step_up_sip" ? "Step-up SIP" : "Monthly SIP";

  const row = (label, value) => `
    <tr>
      <td style="padding:10px 16px;font-size:14px;font-weight:600;color:#374151;border-bottom:1px solid #F3F4F6;width:180px;background:#F9FAFB">${label}</td>
      <td style="padding:10px 16px;font-size:14px;color:#111827;border-bottom:1px solid #F3F4F6">${value}</td>
    </tr>`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#F4F6FB;font-family:'Helvetica Neue',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6FB;padding:32px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
        <tr>
          <td style="background:${BRAND_COLOR};padding:24px 32px">
            <p style="margin:0;font-size:20px;font-weight:800;color:#fff">${BRAND} — Admin</p>
            <p style="margin:4px 0 0;font-size:12px;color:${GOLD};letter-spacing:2px;text-transform:uppercase">New Goal Saved</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:8px;overflow:hidden">
              ${row("Name",          userName   || "—")}
              ${row("Mobile",        mobile     || "—")}
              ${row("Email",         email      || "—")}
              ${row("Goal Type",     goalLabel)}
              ${row("Goal Name",     goalName)}
              ${row("Target Amount", fmt(targetAmount))}
              ${row(sipLabel,        fmt(chosenSip) + "/mo")}
              ${row("Plan Chosen",   chosenPlan === "step_up_sip" ? "Step-up SIP" : "Flat SIP")}
              ${row("User ID",       userUniqueId)}
              ${row("Date",          new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST")}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 24px;text-align:center">
            <p style="margin:0;font-size:11px;color:#9CA3AF">© ${new Date().getFullYear()} ${BRAND}</p>
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
    subject: `New Goal Saved — ${userName || "User"} | ${goalLabel} | ${fmt(targetAmount)}`,
    text:    `${userName || "A user"} saved a ${goalLabel} goal "${goalName}". Target: ${fmt(targetAmount)} | ${sipLabel}: ${fmt(chosenSip)}/mo`,
    html,
  });
};

/* ================================================================
 * PORTFOLIO REVIEW COMPLETED — EMAIL TO USER
 * keyPoints: string[] — each item = one review point (one line from advisor)
 * ================================================================ */
export const sendPortfolioReviewEmail = async ({ to, userName, keyPoints, reviewDate }) => {
  const displayName = userName?.trim() || "Investor";
  const dateStr     = reviewDate
    ? new Date(reviewDate).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })
    : new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

  const pointsHtml = keyPoints
    .map((point) => point.trim())
    .filter(Boolean)
    .map(
      (point) => `
        <tr>
          <td style="padding:0 0 0 12px;vertical-align:top;color:${GOLD};font-size:18px;line-height:1.6;width:20px">•</td>
          <td style="padding:10px 0 10px 10px;font-size:15px;color:#374151;line-height:1.7;border-bottom:1px solid #F3F4F6">${point}</td>
        </tr>`
    )
    .join("");

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#F4F6FB;font-family:'Helvetica Neue',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6FB;padding:32px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">

        <!-- Header -->
        <tr>
          <td style="background:${BRAND_COLOR};padding:24px 32px">
            <p style="margin:0;font-size:22px;font-weight:800;color:#fff;letter-spacing:1px">${BRAND}</p>
            <p style="margin:4px 0 0;font-size:12px;color:${GOLD};letter-spacing:2px;text-transform:uppercase">Wealth · Done Right</p>
          </td>
        </tr>

        <!-- Title Banner -->
        <tr>
          <td style="background:#EFF6FF;padding:20px 32px;border-bottom:2px solid #DBEAFE">
            <p style="margin:0;font-size:13px;color:#6B7280;text-transform:uppercase;letter-spacing:1px">Portfolio Review</p>
            <p style="margin:4px 0 0;font-size:20px;font-weight:800;color:${BRAND_COLOR}">Your Review Notes — ${dateStr}</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px">
            <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 8px">Dear <strong>${displayName}</strong>,</p>
            <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 28px">
              Your portfolio review has been completed. Below are the key action points and observations from your advisor:
            </p>

            <!-- Review Points -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFF;border:1px solid #DBEAFE;border-radius:10px;padding:4px 16px;margin:0 0 28px">
              <thead>
                <tr>
                  <td colspan="2" style="padding:14px 0 10px;font-size:13px;font-weight:700;color:${BRAND_COLOR};text-transform:uppercase;letter-spacing:1px">Action Points</td>
                </tr>
              </thead>
              <tbody>
                ${pointsHtml}
              </tbody>
            </table>

            <!-- Next Step -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px">
              <tr>
                <td style="background:linear-gradient(135deg,#FFF9E6 0%,#FFFBF0 100%);border:2px solid ${GOLD};border-radius:10px;padding:18px 22px">
                  <p style="margin:0 0 8px;font-size:13px;font-weight:800;color:#92400E;text-transform:uppercase;letter-spacing:1px">Questions or need clarity?</p>
                  <p style="margin:0 0 14px;font-size:14px;color:#4B5563;line-height:1.7">
                    Connect directly with our team — we're here to help you take the next step on each of these points.
                  </p>
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="background:${BRAND_COLOR};border-radius:6px;padding:10px 22px">
                        <a href="https://wa.me/918801648801"
                           style="color:#fff;font-size:14px;font-weight:700;text-decoration:none">
                          💬 WhatsApp Us
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <p style="color:#6B7280;font-size:13px;line-height:1.6;margin:0">
              Your next portfolio review will be scheduled in 6 months. If you have questions before then, feel free to reach out at
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

  const plainText = [
    `Dear ${displayName},`,
    ``,
    `Your portfolio review (${dateStr}) has been completed. Here are your action points:`,
    ``,
    ...keyPoints.filter(Boolean).map((p, i) => `${i + 1}. ${p}`),
    ``,
    `Questions? WhatsApp us at +91 88016 48801 or email support@bharatwealth.app`,
    ``,
    `— ${BRAND} Team`,
  ].join("\n");

  await getTransporter().sendMail({
    from:    `"${BRAND}" <${process.env.SMTP_FROM}>`,
    to,
    cc:      process.env.SUPPORT_EMAIL || "support@bharatwealth.app",
    subject: `Your Portfolio Review Notes — ${BRAND} (${dateStr})`,
    text:    plainText,
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
