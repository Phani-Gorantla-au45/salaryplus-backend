import mongoose from "mongoose";

/* ------------------------------------------------------------------ */
/*  Family Audit — append-only log of link events.                     */
/*  Also used for rate-limiting link attempts (PAN lookups / OTPs).     */
/* ------------------------------------------------------------------ */
const familyAuditSchema = new mongoose.Schema(
  {
    actorId: { type: String, required: true, index: true }, // who did it
    linkId:  { type: String, default: null },
    event: {
      type: String,
      enum: [
        "initiate",          // PAN submitted, OTP sent
        "initiate_failed",   // PAN not found / not allowed
        "otp_resent",
        "otp_failed",
        "linked",
        "revoked_by_owner",
        "revoked_by_member",
      ],
      required: true,
    },
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

familyAuditSchema.index({ actorId: 1, event: 1, createdAt: -1 });

export default mongoose.model("FamilyAudit", familyAuditSchema);
