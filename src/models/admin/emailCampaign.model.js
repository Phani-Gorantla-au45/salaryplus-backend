import mongoose from "mongoose";

const emailCampaignSchema = new mongoose.Schema(
  {
    subject:    { type: String, required: true },
    htmlBody:   { type: String, required: true },
    textBody:   { type: String, default: null },

    // "all" | array of uniqueIds
    recipientType: { type: String, enum: ["all", "selected"], required: true },
    recipientIds:  { type: [String], default: [] }, // populated only when type="selected"
    recipientCount: { type: Number, default: 0 },

    isTest:  { type: Boolean, default: false }, // preview sends
    sentBy:  { type: String, default: null },   // admin uniqueId

    status: {
      type:    String,
      enum:    ["pending", "sending", "sent", "failed"],
      default: "pending",
    },

    deliveredCount: { type: Number, default: 0 },
    failedCount:    { type: Number, default: 0 },
    failedEmails:   { type: [String], default: [] },

    sentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("EmailCampaign", emailCampaignSchema);
