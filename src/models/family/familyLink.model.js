import mongoose from "mongoose";

/* ------------------------------------------------------------------ */
/*  Family Link                                                         */
/*                                                                      */
/*  ownerId  — the user who wants to VIEW (logged-in user, uniqueId)    */
/*  memberId — the family member whose portfolio is shared (uniqueId)   */
/*                                                                      */
/*  A link becomes "active" only after the member's consent OTP (sent   */
/*  to the member's registered mobile) is verified. Either side can     */
/*  revoke it at any time. Links are one-directional: A → B does not    */
/*  let B see A, and never chains (A cannot see B's own members).       */
/* ------------------------------------------------------------------ */
const familyLinkSchema = new mongoose.Schema(
  {
    ownerId:  { type: String, required: true, index: true },
    memberId: { type: String, required: true, index: true },

    relation: {
      type: String,
      enum: ["spouse", "parent", "child", "sibling", "other"],
      default: "other",
    },

    status: {
      type: String,
      enum: ["pending", "active", "revoked"],
      default: "pending",
      index: true,
    },

    // Consent OTP (hashed) — only while pending
    otpHash:      { type: String, default: null, select: false },
    otpExpiresAt: { type: Date, default: null },
    otpSentAt:    { type: Date, default: null },
    otpAttempts:  { type: Number, default: 0 },
    resendCount:  { type: Number, default: 0 },

    // Consent record
    consentAt:          { type: Date, default: null },
    consentPhoneMasked: { type: String, default: null },

    revokedAt: { type: Date, default: null },
    revokedBy: { type: String, enum: ["owner", "member", null], default: null },

    lastViewedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// One link document per owner→member pair (re-linking reuses it)
familyLinkSchema.index({ ownerId: 1, memberId: 1 }, { unique: true });

export default mongoose.model("FamilyLink", familyLinkSchema);
