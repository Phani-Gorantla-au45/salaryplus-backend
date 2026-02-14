import mongoose from "mongoose";

const bondSchema = new mongoose.Schema(
  {
    bondLaunchId: {
      type: Number,
      required: true,
      unique: true,
    },

    bondName: {
      type: String,
      required: true,
    },

    isin: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
    },

    faceValue: {
      type: Number,
      required: true,
    },

    unitsAvailable: {
      type: Number,
      required: true,
    },

    ytm: {
      type: Number,
      required: true,
    },

    couponRate: {
      type: Number,
      required: true,
    },

    interestPayoutFrequency: {
      type: String,
      enum: ["MONTHLY", "QUARTERLY", "YEARLY", "DAILY"],
      required: true,
    },

    principalPayoutFrequency: {
      type: String,
      enum: ["BULLET"],
      required: true,
    },

    maturityDate: {
      type: Date,
      required: true,
    },

    couponBasis: {
      type: String,
      enum: ["FIXED"],
      required: true,
    },

    security: {
      type: String,
      enum: ["SECURED", "UNSECURED"],
      required: true,
    },

    guaranteeType: {
      type: String,
      enum: ["GUARANTEED", "NOT_GUARANTEED"],
      required: true,
    },

    repaymentPriority: {
      type: String,
      enum: ["SENIOR", "SUBORDINATE"],
      required: true,
    },

    rating: {
      type: String,
      required: true,
    },

    ratingAgency: {
      type: String,
      required: true,
    },

    ratingDate: {
      type: Date,
      required: true,
    },

    issuerName: {
      type: String,
      required: true,
    },

    debentureTrustee: {
      type: String,
    },

    collectionName: {
      type: String,
      default: "BondListings",
    },
  },
  { timestamps: true },
);

export default mongoose.model("Bond", bondSchema);
