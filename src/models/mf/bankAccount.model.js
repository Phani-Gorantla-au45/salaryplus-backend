import mongoose from "mongoose";

const bankAccountSchema = new mongoose.Schema(
  {
    uniqueId:            { type: String, required: true, index: true },
    fpInvestorProfileId: { type: String, required: true, index: true },
    fpBankAccountId:     { type: String, unique: true, sparse: true, index: true },

    accountNumber:              { type: String },
    primaryAccountHolderName:   { type: String },
    type:      { type: String }, // savings | current | nre | nro
    ifscCode:  { type: String },

    // Populated by FP from IFSC lookup
    bankName:      { type: String, default: null },
    branchName:    { type: String, default: null },
    branchCity:    { type: String, default: null },
    branchState:   { type: String, default: null },
    branchAddress: { type: String, default: null },

    rawResponse: { type: mongoose.Schema.Types.Mixed, select: false },
  },
  { timestamps: true }
);

export default mongoose.model("BankAccount", bankAccountSchema);
