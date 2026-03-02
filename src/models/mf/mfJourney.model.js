import mongoose from "mongoose";

/**
 * Single source of truth for a user's MF onboarding journey.
 * One document per user. All stage flags live here.
 *
 * Journey order:
 *  1. Risk Profile  → riskProfile stage
 *  2. KYC Check     → kycCheck stage     (PAN pre-verification via Cybrilla)
 *  3. KYC Submit    → kycSubmit stage     (only if kycCheck is NOT compliant)
 *  4. Account       → account stage       (investor account creation at FP)
 *  5. Invest        → canInvest = true
 */
const mfJourneySchema = new mongoose.Schema(
  {
    uniqueId: { type: String, required: true, unique: true, index: true },

    /* ── STAGE 1: RISK PROFILE ─────────────────────────────────────── */
    riskProfile: {
      status:      { type: String, enum: ["not_started", "completed"], default: "not_started" },
      score:       { type: Number, default: null },
      category:    { type: String, enum: ["conservative", "moderate", "aggressive", null], default: null },
      answers:     { type: mongoose.Schema.Types.Mixed, default: null }, // raw submitted answers
      completedAt: { type: Date, default: null },
    },

    /* ── STAGE 2: KYC CHECK (PAN pre-verification) ─────────────────── */
    kycCheck: {
      // not_started | compliant | not_compliant | pending | upstream_error
      status:      { type: String, default: "not_started" },
      completedAt: { type: Date, default: null },
    },

    /* ── STAGE 3: KYC SUBMISSION (only if kycCheck = not_compliant) ── */
    kycSubmit: {
      // not_applicable | not_started | in_progress | submitted | successful | rejected | expired
      status:         { type: String, default: "not_applicable" },
      fpKycRequestId: { type: String, default: null },
      completedAt:    { type: Date, default: null },
    },

    /* ── STAGE 4: INVESTOR ACCOUNT CREATION ────────────────────────── */
    account: {
      // not_started | completed
      status:      { type: String, default: "not_started" },
      completedAt: { type: Date, default: null },
    },

    /* ── FINAL FLAG ────────────────────────────────────────────────── */
    canInvest: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model("MfJourney", mfJourneySchema);
