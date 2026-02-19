import mongoose from "mongoose";

const bondSchema = new mongoose.Schema(
  {
    bondLaunchId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    bondName: {
      type: String,
      required: true,
      trim: true,
    },
    bondLogoUrl: {
      type: String,
      trim: true,
    },

    isin: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      index: true,
    },

    issuerName: {
      type: String,
      required: true,
      trim: true,
    },

    faceValue: {
      type: Number,
      required: true,
      min: 1,
    },

    availableUnits: {
      type: Number,
      required: true,
      min: 0,
    },
    totalUnits: {
      type: Number,
      required: true,
      min: 0,
    },

    ytm: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },

    couponRate: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },

    interestPayoutFrequency: {
      type: String,
      enum: ["MONTHLY", "QUARTERLY", "YEARLY"],
      required: true,
    },

    principalPayoutFrequency: {
      type: String,
      enum: ["BULLET"],
      required: true,
      default: "BULLET",
    },

    maturityDate: {
      type: Date,
      required: true,
    },

    couponBasis: {
      type: String,
      enum: ["FIXED"],
      default: "FIXED",
    },

    security: {
      type: String,
      enum: ["SECURED", "UNSECURED"],
      required: true,
    },
    securityCover: {
      type: Number,
      min: 0,
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
    collateral: {
      type: String,
      trim: true,
    },

    investmentAmount: {
      type: Number,
      min: 0,
    },

    debentureTrustee: {
      type: String,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "FULLYSUBSCRIBED", "REPAID"],
      default: "ACTIVE",
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model("BondListing", bondSchema);
