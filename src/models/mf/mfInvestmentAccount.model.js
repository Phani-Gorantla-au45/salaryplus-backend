import mongoose from "mongoose";

const folioDefaultsSchema = new mongoose.Schema(
  {
    communication_email_address:    { type: String, default: null },
    communication_mobile_number:    { type: String, default: null },
    communication_address:          { type: String, default: null },
    payout_bank_account:            { type: String, default: null },
    nominee1:                       { type: String, default: null },
    nominee1_allocation_percentage: { type: Number, default: null },
    nominations_info_visibility:    { type: String, default: null },
  },
  { _id: false }
);

const mfInvestmentAccountSchema = new mongoose.Schema(
  {
    uniqueId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // FP investment account ID (mfia_...)
    fpInvestmentAccountId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },

    primaryInvestorPan: { type: String, uppercase: true, trim: true },
    fpInvestorProfileId: { type: String },
    holdingPattern:      { type: String, default: "single" },
    folioDefaults:       { type: folioDefaultsSchema, default: null },

    rawResponse: { type: mongoose.Schema.Types.Mixed, select: false },
  },
  { timestamps: true }
);

export default mongoose.model("MfInvestmentAccount", mfInvestmentAccountSchema);
