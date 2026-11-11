import mongoose from "mongoose";
import FamilyLink from "../models/family/familyLink.model.js";
import User from "../models/user/user.model.js";

/* ------------------------------------------------------------------ */
/*  asFamilyMember                                                      */
/*                                                                      */
/*  Runs AFTER `auth`. Verifies the logged-in user (owner) has an       */
/*  ACTIVE link with id :linkId, then scopes the request to the member  */
/*  by replacing req.user.uniqueId with the member's uniqueId.          */
/*                                                                      */
/*  The existing (unchanged) controllers then run exactly as they do    */
/*  for the member themselves. Only the routes explicitly mounted in    */
/*  routes/family/family.routes.js can be reached this way.             */
/* ------------------------------------------------------------------ */
export const asFamilyMember = async (req, res, next) => {
  try {
    const ownerId = req.user?.uniqueId;
    const { linkId } = req.params;

    if (!ownerId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!mongoose.isValidObjectId(linkId)) {
      return res.status(404).json({ success: false, message: "Family member not found" });
    }

    const link = await FamilyLink.findOne({ _id: linkId, ownerId, status: "active" }).lean();
    if (!link) {
      return res.status(403).json({ success: false, message: "You no longer have access to this family member." });
    }

    const member = await User.exists({ uniqueId: link.memberId });
    if (!member) {
      return res.status(403).json({ success: false, message: "This family member's account is no longer available." });
    }

    // Scope the request to the member. Keep the real identity for auditing.
    req.family = { ownerId, memberId: link.memberId, linkId: String(link._id) };
    req.user = { uniqueId: link.memberId };

    // Transparency for the member ("last viewed") — throttled to once per 10 min
    const tenMinAgo = Date.now() - 10 * 60 * 1000;
    if (!link.lastViewedAt || new Date(link.lastViewedAt).getTime() < tenMinAgo) {
      FamilyLink.updateOne({ _id: link._id }, { $set: { lastViewedAt: new Date() } }).catch(() => {});
    }

    // Defence in depth: never pass OTP codes through to another person
    const json = res.json.bind(res);
    res.json = (body) => json(stripSecrets(body));

    next();
  } catch (err) {
    console.error("❌ [FAMILY] asFamilyMember:", err.message);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

const SECRET_KEYS = new Set(["otp", "otpCode", "otpHash", "otp_code"]);

function stripSecrets(value, depth = 0) {
  if (depth > 12 || value == null || typeof value !== "object") { return value; }
  if (value instanceof Date) { return value; }
  if (Array.isArray(value)) { return value.map((v) => stripSecrets(v, depth + 1)); }
  if (typeof value.toJSON === "function" && !(value.constructor === Object)) {
    return stripSecrets(value.toJSON(), depth + 1);
  }
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (SECRET_KEYS.has(k)) { continue; }
    out[k] = stripSecrets(v, depth + 1);
  }
  return out;
}
