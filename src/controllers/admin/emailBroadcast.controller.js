import User from "../../models/user/user.model.js";
import EmailCampaign from "../../models/admin/emailCampaign.model.js";
import {
  buildCampaignHtml,
  sendOneCampaignEmail,
  sendBatchCampaign,
} from "../../utils/admin/emailBroadcast.utils.js";

const TEST_EMAIL = "phanigorantla531@gmail.com";

/* ------------------------------------------------------------------ */
/*  Resolve recipient list → [{ email, uniqueId }]                     */
/*  recipients = "all"  |  ["uid1", "uid2", ...]                       */
/* ------------------------------------------------------------------ */
const resolveRecipients = async (recipients) => {
  const filter = { email: { $exists: true, $ne: null, $ne: "" } };

  if (Array.isArray(recipients) && recipients.length > 0) {
    filter.uniqueId = { $in: recipients };
  }

  const users = await User.find(filter, { uniqueId: 1, email: 1, First_name: 1, Last_name: 1 }).lean();
  return users
    .filter((u) => u.email && u.email.includes("@"))
    .map((u) => ({
      uniqueId: u.uniqueId,
      email:    u.email,
      name:     [u.First_name, u.Last_name].filter(Boolean).join(" ") || "Investor",
    }));
};

/* ================================================================
 * POST /api/admin/email/preview
 * Sends a test email to phanigorantla531@gmail.com so the founder
 * can see exactly how it will look before sending to users.
 *
 * Body: { subject, body, testEmail? }
 * ================================================================ */
export const previewEmail = async (req, res) => {
  try {
    const { subject, body, testEmail } = req.body;

    if (!subject?.trim()) return res.status(400).json({ success: false, message: "subject is required" });
    if (!body?.trim())    return res.status(400).json({ success: false, message: "body is required" });

    const to   = testEmail?.trim() || TEST_EMAIL;
    const html = buildCampaignHtml(subject, body);

    await sendOneCampaignEmail(to, `[PREVIEW] ${subject}`, html, body.replace(/<[^>]+>/g, ""));

    // Log as test campaign
    await EmailCampaign.create({
      subject,
      htmlBody:      html,
      textBody:      body.replace(/<[^>]+>/g, ""),
      recipientType: "selected",
      recipientIds:  [to],
      recipientCount: 1,
      isTest:        true,
      sentBy:        req.admin?.uniqueId ?? null,
      status:        "sent",
      deliveredCount: 1,
      sentAt:        new Date(),
    });

    return res.status(200).json({
      success: true,
      message: `Preview email sent to ${to}`,
      sentTo:  to,
    });
  } catch (err) {
    console.error("❌ [EMAIL PREVIEW] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ================================================================
 * POST /api/admin/email/send
 * Send campaign to all users or a selected list.
 * Fire-and-forget — responds immediately, sends in background.
 *
 * Body: {
 *   subject*    string
 *   body*       string (HTML or plain text)
 *   recipients  "all" | ["uniqueId1", "uniqueId2", ...]   (default: "all")
 * }
 * ================================================================ */
export const sendCampaign = async (req, res) => {
  try {
    const { subject, body, recipients = "all" } = req.body;

    if (!subject?.trim()) return res.status(400).json({ success: false, message: "subject is required" });
    if (!body?.trim())    return res.status(400).json({ success: false, message: "body is required" });

    const isAll = recipients === "all";
    if (!isAll && (!Array.isArray(recipients) || recipients.length === 0)) {
      return res.status(400).json({
        success: false,
        message: "recipients must be \"all\" or a non-empty array of uniqueIds",
      });
    }

    const recipientList = await resolveRecipients(isAll ? "all" : recipients);
    if (recipientList.length === 0) {
      return res.status(400).json({ success: false, message: "No users with valid emails found for the given recipients" });
    }

    const html = buildCampaignHtml(subject, body);

    // Create campaign record immediately
    const campaign = await EmailCampaign.create({
      subject,
      htmlBody:      html,
      textBody:      body.replace(/<[^>]+>/g, ""),
      recipientType: isAll ? "all" : "selected",
      recipientIds:  isAll ? [] : (Array.isArray(recipients) ? recipients : []),
      recipientCount: recipientList.length,
      isTest:        false,
      sentBy:        req.admin?.uniqueId ?? null,
      status:        "sending",
    });

    // Respond immediately — send in background
    res.status(202).json({
      success: true,
      message: `Campaign accepted. Sending to ${recipientList.length} user(s) in the background.`,
      campaignId:     campaign._id,
      recipientCount: recipientList.length,
    });

    // Background send
    sendBatchCampaign(recipientList, subject, html, body.replace(/<[^>]+>/g, ""))
      .then(async ({ delivered, failed }) => {
        await EmailCampaign.findByIdAndUpdate(campaign._id, {
          $set: {
            status:         "sent",
            deliveredCount: delivered,
            failedCount:    failed.length,
            failedEmails:   failed,
            sentAt:         new Date(),
          },
        });
        console.log(`✅ [EMAIL BROADCAST] Campaign ${campaign._id} done — ${delivered} delivered, ${failed.length} failed`);
      })
      .catch(async (err) => {
        await EmailCampaign.findByIdAndUpdate(campaign._id, {
          $set: { status: "failed" },
        });
        console.error(`❌ [EMAIL BROADCAST] Campaign ${campaign._id} failed:`, err.message);
      });

  } catch (err) {
    console.error("❌ [EMAIL SEND] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ================================================================
 * GET /api/admin/email/campaigns
 * List all campaigns (excluding test previews by default).
 * Query: ?includeTests=true  to include preview sends
 * ================================================================ */
export const listCampaigns = async (req, res) => {
  try {
    const { includeTests, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (includeTests !== "true") filter.isTest = { $ne: true };

    const pageNum  = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));
    const skip     = (pageNum - 1) * limitNum;

    const [campaigns, total] = await Promise.all([
      EmailCampaign.find(filter, { htmlBody: 0 })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      EmailCampaign.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      data: campaigns,
    });
  } catch (err) {
    console.error("❌ [EMAIL LIST] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ================================================================
 * GET /api/admin/email/campaigns/:id
 * Full details of one campaign including the HTML body.
 * ================================================================ */
export const getCampaign = async (req, res) => {
  try {
    const campaign = await EmailCampaign.findById(req.params.id).lean();
    if (!campaign) return res.status(404).json({ success: false, message: "Campaign not found" });

    return res.status(200).json({ success: true, data: campaign });
  } catch (err) {
    console.error("❌ [EMAIL GET] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ================================================================
 * GET /api/admin/email/users
 * Returns list of users with emails — useful for the frontend
 * to let admin pick individual recipients.
 * Query: ?search=name/email  (optional filter)
 * ================================================================ */
export const listEmailableUsers = async (req, res) => {
  try {
    const { search } = req.query;
    const filter = { email: { $exists: true, $ne: null, $ne: "" } };

    if (search) {
      const re = new RegExp(search, "i");
      filter.$or = [{ First_name: re }, { Last_name: re }, { email: re }, { phone: re }];
    }

    const users = await User.find(filter, {
      uniqueId:   1,
      First_name: 1,
      Last_name:  1,
      email:      1,
      phone:      1,
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return res.status(200).json({
      success: true,
      count: users.length,
      data: users.map((u) => ({
        uniqueId: u.uniqueId,
        name:     [u.First_name, u.Last_name].filter(Boolean).join(" ") || "—",
        email:    u.email,
        phone:    u.phone ?? null,
      })),
    });
  } catch (err) {
    console.error("❌ [EMAIL USERS] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
