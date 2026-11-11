import crypto from "crypto";
import mongoose from "mongoose";
import FamilyLink from "../../models/family/familyLink.model.js";
import FamilyAudit from "../../models/family/familyAudit.model.js";
import User from "../../models/user/user.model.js";
import MfUserData from "../../models/mf/mfUserData.model.js";
import { hashOtp, verifyOtp } from "../../utils/otp.utils.js";
import { sendSmsOtp } from "../../utils/notifications/sms.utils.js";
import { sendFamilyLinkedEmail } from "../../utils/notifications/familyEmail.utils.js";

/* ------------------------------------------------------------------ */
/*  Family Portfolio — linking                                          */
/*                                                                      */
/*  POST   /api/family/links/initiate      { pan, relation }            */
/*  POST   /api/family/links/:linkId/resend                             */
/*  POST   /api/family/links/:linkId/verify { otp }                     */
/*  GET    /api/family/members             (people I can view)          */
/*  DELETE /api/family/links/:linkId       (I stop viewing them)        */
/*  GET    /api/family/viewers             (people who can view me)     */
/*  DELETE /api/family/viewers/:linkId     (I remove their access)      */
/* ------------------------------------------------------------------ */

const PAN_RE          = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const RELATIONS       = ["spouse", "parent", "child", "sibling", "other"];
const OTP_TTL_MS      = 10 * 60 * 1000;
const RESEND_AFTER_S  = 30;
const MAX_RESENDS     = 3;
const MAX_OTP_TRIES   = 5;
const MAX_MEMBERS     = 5;   // people one user can view
const MAX_VIEWERS     = 5;   // people who can view one user
const MAX_INIT_HOUR   = 5;
const MAX_INIT_DAY    = 15;

const maskPhone = (p) => {
  const s = String(p ?? "").replace(/\D/g, "");
  return s.length >= 4 ? `******${s.slice(-4)}` : "******";
};
const newOtp = () => String(crypto.randomInt(100000, 1000000)); // 6 digits
const audit = (actorId, event, linkId = null, meta = null) =>
  FamilyAudit.create({ actorId, event, linkId: linkId ? String(linkId) : null, meta }).catch(() => {});

const fullName = (u) => [u?.First_name, u?.Last_name].filter(Boolean).join(" ").trim();

/** Summary of a user shown on the other side of a link (no PAN, bank or KYC data). */
async function personSummary(uniqueId) {
  const [user, mf] = await Promise.all([
    User.findOne({ uniqueId }, { First_name: 1, Last_name: 1, phone: 1, mfAccount: 1, bondKycStatus: 1 }).lean(),
    MfUserData.findOne({ uniqueId }, { "investorProfile.name": 1, "kycStatus.name": 1, "investmentAccount.fpInvestmentAccountOldId": 1 }).lean(),
  ]);
  if (!user) { return null; }
  const name = fullName(user) || mf?.investorProfile?.name || mf?.kycStatus?.name || "Family member";
  return {
    name,
    phoneMasked: maskPhone(user.phone),
    mfReady:     user.mfAccount === "yes" || !!mf?.investmentAccount?.fpInvestmentAccountOldId,
    bondsReady:  user.bondKycStatus === "APPROVED",
  };
}

/** Find the single registered user holding this PAN (bond PAN or MF KYC PAN). */
async function findUsersByPan(pan) {
  const variants = [pan, pan.toLowerCase()];
  const [users, mfUsers] = await Promise.all([
    User.find({ panNumber: { $in: variants } }, { uniqueId: 1 }).lean(),
    MfUserData.find(
      { $or: [{ "kycStatus.pan": { $in: variants } }, { "investorProfile.pan": { $in: variants } }] },
      { uniqueId: 1 },
    ).lean(),
  ]);
  const ids = new Set([...users, ...mfUsers].map((u) => u.uniqueId).filter(Boolean));
  // Only ids that are real, registered app users
  if (ids.size === 0) { return []; }
  const registered = await User.find({ uniqueId: { $in: [...ids] } }, { uniqueId: 1, phone: 1 }).lean();
  return registered;
}

/* ================================================================ */
/*  POST /api/family/links/initiate                                  */
/* ================================================================ */
export const initiateLink = async (req, res) => {
  const ownerId = req.user.uniqueId;
  try {
    const pan = String(req.body?.pan ?? "").trim().toUpperCase();
    const relation = RELATIONS.includes(req.body?.relation) ? req.body.relation : "other";

    if (!PAN_RE.test(pan)) {
      return res.status(400).json({ success: false, message: "Please enter a valid PAN (e.g. ABCDE1234F)." });
    }

    /* ---------- Rate limit (PAN lookups) ---------- */
    const now = Date.now();
    const [inHour, inDay] = await Promise.all([
      FamilyAudit.countDocuments({ actorId: ownerId, event: { $in: ["initiate", "initiate_failed"] }, createdAt: { $gte: new Date(now - 3600e3) } }),
      FamilyAudit.countDocuments({ actorId: ownerId, event: { $in: ["initiate", "initiate_failed"] }, createdAt: { $gte: new Date(now - 86400e3) } }),
    ]);
    if (inHour >= MAX_INIT_HOUR || inDay >= MAX_INIT_DAY) {
      return res.status(429).json({ success: false, message: "Too many attempts. Please try again after some time." });
    }

    /* ---------- Find the member ---------- */
    const matches = await findUsersByPan(pan);
    if (matches.length === 0) {
      await audit(ownerId, "initiate_failed", null, { reason: "not_found" });
      return res.status(404).json({
        success: false,
        message: "No Bharat Wealth account found with this PAN. Ask your family member to sign up and verify their PAN first.",
      });
    }
    if (matches.length > 1) {
      await audit(ownerId, "initiate_failed", null, { reason: "multiple" });
      return res.status(409).json({ success: false, message: "We couldn't link this PAN automatically. Please contact support." });
    }
    const member = matches[0];

    if (member.uniqueId === ownerId) {
      await audit(ownerId, "initiate_failed", null, { reason: "self" });
      return res.status(400).json({ success: false, message: "This is your own PAN. Enter your family member's PAN." });
    }
    if (!member.phone) {
      await audit(ownerId, "initiate_failed", null, { reason: "no_phone" });
      return res.status(400).json({ success: false, message: "Your family member has no registered mobile number." });
    }

    /* ---------- Limits ---------- */
    const existing = await FamilyLink.findOne({ ownerId, memberId: member.uniqueId }).lean();
    if (existing?.status === "active") {
      return res.status(409).json({ success: false, message: "This family member is already linked." });
    }
    const [myMembers, theirViewers] = await Promise.all([
      FamilyLink.countDocuments({ ownerId, status: "active" }),
      FamilyLink.countDocuments({ memberId: member.uniqueId, status: "active" }),
    ]);
    if (myMembers >= MAX_MEMBERS) {
      return res.status(400).json({ success: false, message: `You can link up to ${MAX_MEMBERS} family members.` });
    }
    if (theirViewers >= MAX_VIEWERS) {
      return res.status(400).json({ success: false, message: "This member's portfolio is already shared with the maximum number of people." });
    }

    /* ---------- Create / reuse pending link + send OTP ---------- */
    const otp = newOtp();
    const link = await FamilyLink.findOneAndUpdate(
      { ownerId, memberId: member.uniqueId },
      {
        $set: {
          relation,
          status:       "pending",
          otpHash:      hashOtp(otp),
          otpExpiresAt: new Date(now + OTP_TTL_MS),
          otpSentAt:    new Date(now),
          otpAttempts:  0,
          resendCount:  0,
          revokedAt:    null,
          revokedBy:    null,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    try {
      await sendSmsOtp(member.phone, otp);
    } catch (e) {
      console.error("❌ [FAMILY] OTP SMS failed:", e.message);
      return res.status(502).json({ success: false, message: "Couldn't send the OTP right now. Please try again." });
    }

    await audit(ownerId, "initiate", link._id, { memberId: member.uniqueId });

    return res.status(200).json({
      success: true,
      data: {
        linkId:       String(link._id),
        otpSentTo:    maskPhone(member.phone),
        otpExpiresAt: link.otpExpiresAt,
        resendAfter:  RESEND_AFTER_S,
      },
    });
  } catch (err) {
    console.error("❌ [FAMILY] initiateLink:", err.message);
    return res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
  }
};

/* ================================================================ */
/*  POST /api/family/links/:linkId/resend                            */
/* ================================================================ */
export const resendLinkOtp = async (req, res) => {
  const ownerId = req.user.uniqueId;
  try {
    const { linkId } = req.params;
    if (!mongoose.isValidObjectId(linkId)) {
      return res.status(404).json({ success: false, message: "Request not found. Please start again." });
    }
    const link = await FamilyLink.findOne({ _id: linkId, ownerId, status: "pending" });
    if (!link) {
      return res.status(404).json({ success: false, message: "Request not found. Please start again." });
    }
    const since = link.otpSentAt ? (Date.now() - link.otpSentAt.getTime()) / 1000 : Infinity;
    if (since < RESEND_AFTER_S) {
      return res.status(429).json({ success: false, message: `Please wait ${Math.ceil(RESEND_AFTER_S - since)}s before resending.` });
    }
    if (link.resendCount >= MAX_RESENDS) {
      return res.status(429).json({ success: false, message: "Resend limit reached. Please start again." });
    }
    const member = await User.findOne({ uniqueId: link.memberId }, { phone: 1 }).lean();
    if (!member?.phone) {
      return res.status(400).json({ success: false, message: "Your family member has no registered mobile number." });
    }

    const otp = newOtp();
    link.otpHash      = hashOtp(otp);
    link.otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
    link.otpSentAt    = new Date();
    link.otpAttempts  = 0;
    link.resendCount += 1;
    await link.save();

    try {
      await sendSmsOtp(member.phone, otp);
    } catch (e) {
      console.error("❌ [FAMILY] OTP resend failed:", e.message);
      return res.status(502).json({ success: false, message: "Couldn't send the OTP right now. Please try again." });
    }
    await audit(ownerId, "otp_resent", link._id);

    return res.status(200).json({
      success: true,
      data: { otpSentTo: maskPhone(member.phone), otpExpiresAt: link.otpExpiresAt, resendAfter: RESEND_AFTER_S },
    });
  } catch (err) {
    console.error("❌ [FAMILY] resendLinkOtp:", err.message);
    return res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
  }
};

/* ================================================================ */
/*  POST /api/family/links/:linkId/verify                            */
/* ================================================================ */
export const verifyLink = async (req, res) => {
  const ownerId = req.user.uniqueId;
  try {
    const { linkId } = req.params;
    const otp = String(req.body?.otp ?? "").replace(/\D/g, "");
    if (!mongoose.isValidObjectId(linkId)) {
      return res.status(404).json({ success: false, message: "Request not found. Please start again." });
    }
    if (otp.length !== 6) {
      return res.status(400).json({ success: false, message: "Please enter the 6-digit OTP." });
    }

    const link = await FamilyLink.findOne({ _id: linkId, ownerId, status: "pending" }).select("+otpHash");
    if (!link || !link.otpHash) {
      return res.status(404).json({ success: false, message: "Request not found. Please start again." });
    }
    if (!link.otpExpiresAt || link.otpExpiresAt.getTime() < Date.now()) {
      return res.status(400).json({ success: false, message: "OTP expired. Please resend the OTP." });
    }
    if (link.otpAttempts >= MAX_OTP_TRIES) {
      return res.status(429).json({ success: false, message: "Too many wrong attempts. Please start again." });
    }

    if (!verifyOtp(otp, link.otpHash)) {
      link.otpAttempts += 1;
      if (link.otpAttempts >= MAX_OTP_TRIES) { link.otpHash = null; }
      await link.save();
      await audit(ownerId, "otp_failed", link._id);
      const left = MAX_OTP_TRIES - link.otpAttempts;
      return res.status(400).json({
        success: false,
        message: left > 0 ? `Incorrect OTP. ${left} attempt${left === 1 ? "" : "s"} left.` : "Too many wrong attempts. Please start again.",
      });
    }

    const [member, owner] = await Promise.all([
      User.findOne({ uniqueId: link.memberId }, { phone: 1, email: 1, First_name: 1, Last_name: 1 }).lean(),
      User.findOne({ uniqueId: ownerId }, { phone: 1, First_name: 1, Last_name: 1 }).lean(),
    ]);

    link.status             = "active";
    link.consentAt          = new Date();
    link.consentPhoneMasked = maskPhone(member?.phone);
    link.otpHash            = null;
    link.otpExpiresAt       = null;
    link.otpAttempts        = 0;
    await link.save();
    await audit(ownerId, "linked", link._id, { memberId: link.memberId });

    // Tell the member (best effort — never blocks linking)
    if (member?.email) {
      sendFamilyLinkedEmail({
        to:                member.email,
        memberName:        fullName(member),
        viewerName:        fullName(owner),
        viewerPhoneMasked: maskPhone(owner?.phone),
      }).catch((e) => console.error("❌ [FAMILY] linked email failed:", e.message));
    }

    const summary = await personSummary(link.memberId);
    return res.status(200).json({
      success: true,
      message: "Family member linked.",
      data: { linkId: String(link._id), relation: link.relation, since: link.consentAt, ...summary },
    });
  } catch (err) {
    console.error("❌ [FAMILY] verifyLink:", err.message);
    return res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
  }
};

/* ================================================================ */
/*  GET /api/family/members — people I can view                     */
/* ================================================================ */
export const listMembers = async (req, res) => {
  try {
    const links = await FamilyLink.find({ ownerId: req.user.uniqueId, status: "active" }).sort({ consentAt: 1 }).lean();
    const data = (await Promise.all(links.map(async (l) => {
      const s = await personSummary(l.memberId);
      return s ? { linkId: String(l._id), relation: l.relation, since: l.consentAt, ...s } : null;
    }))).filter(Boolean);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error("❌ [FAMILY] listMembers:", err.message);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

/* ================================================================ */
/*  DELETE /api/family/links/:linkId — owner stops viewing           */
/* ================================================================ */
export const removeMember = async (req, res) => {
  try {
    const { linkId } = req.params;
    if (!mongoose.isValidObjectId(linkId)) {
      return res.status(404).json({ success: false, message: "Family member not found" });
    }
    const link = await FamilyLink.findOneAndUpdate(
      { _id: linkId, ownerId: req.user.uniqueId, status: { $in: ["active", "pending"] } },
      { $set: { status: "revoked", revokedAt: new Date(), revokedBy: "owner", otpHash: null } },
      { new: true },
    );
    if (!link) {
      return res.status(404).json({ success: false, message: "Family member not found" });
    }
    await audit(req.user.uniqueId, "revoked_by_owner", link._id, { memberId: link.memberId });
    return res.status(200).json({ success: true, message: "Family member removed." });
  } catch (err) {
    console.error("❌ [FAMILY] removeMember:", err.message);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

/* ================================================================ */
/*  GET /api/family/viewers — people who can view MY portfolio       */
/* ================================================================ */
export const listViewers = async (req, res) => {
  try {
    const links = await FamilyLink.find({ memberId: req.user.uniqueId, status: "active" }).sort({ consentAt: 1 }).lean();
    const data = (await Promise.all(links.map(async (l) => {
      const owner = await User.findOne({ uniqueId: l.ownerId }, { First_name: 1, Last_name: 1, phone: 1 }).lean();
      if (!owner) { return null; }
      return {
        linkId:       String(l._id),
        name:         fullName(owner) || "Bharat Wealth user",
        phoneMasked:  maskPhone(owner.phone),
        relation:     l.relation,
        since:        l.consentAt,
        lastViewedAt: l.lastViewedAt,
      };
    }))).filter(Boolean);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error("❌ [FAMILY] listViewers:", err.message);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

/* ================================================================ */
/*  DELETE /api/family/viewers/:linkId — member removes access       */
/* ================================================================ */
export const removeViewer = async (req, res) => {
  try {
    const { linkId } = req.params;
    if (!mongoose.isValidObjectId(linkId)) {
      return res.status(404).json({ success: false, message: "Not found" });
    }
    const link = await FamilyLink.findOneAndUpdate(
      { _id: linkId, memberId: req.user.uniqueId, status: "active" },
      { $set: { status: "revoked", revokedAt: new Date(), revokedBy: "member" } },
      { new: true },
    );
    if (!link) {
      return res.status(404).json({ success: false, message: "Not found" });
    }
    await audit(req.user.uniqueId, "revoked_by_member", link._id, { ownerId: link.ownerId });
    return res.status(200).json({ success: true, message: "Access removed." });
  } catch (err) {
    console.error("❌ [FAMILY] removeViewer:", err.message);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};
