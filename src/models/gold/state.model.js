import mongoose from "mongoose";

/* ================= STATE SCHEMA ================= */
const stateSchema = new mongoose.Schema(
  {
    stateId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

/* ================= CITY SCHEMA ================= */
const citySchema = new mongoose.Schema(
  {
    cityId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    stateId: {
      type: String,
      required: true,
      index: true, // for fast filtering
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

/* ================= EXPORT MODELS ================= */

// 2 different collections will be created:
export const AugmontState = mongoose.model("AugmontState", stateSchema); // states collection
export const AugmontCity = mongoose.model("AugmontCity", citySchema); // cities collection
