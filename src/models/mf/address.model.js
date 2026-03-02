import mongoose from "mongoose";

const addressSchema = new mongoose.Schema(
  {
    uniqueId:            { type: String, required: true, index: true },
    fpInvestorProfileId: { type: String, required: true, index: true },
    fpAddressId:         { type: String, unique: true, sparse: true, index: true },

    line1:      { type: String, default: null },
    line2:      { type: String, default: null },
    city:       { type: String, default: null },
    state:      { type: String, default: null },
    postalCode: { type: String, default: null },
    country:    { type: String, default: "IN" },
    nature:     { type: String, default: "residential" }, // residential | business_location

    rawResponse: { type: mongoose.Schema.Types.Mixed, select: false },
  },
  { timestamps: true }
);

export default mongoose.model("MfAddress", addressSchema);
