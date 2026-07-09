import mongoose from "mongoose";

const appVersionSchema = new mongoose.Schema(
  {
    platform: {
      type:     String,
      required: true,
      enum:     ["ios", "android"],
      unique:   true,   // one active config per platform
    },

    latestVersion: { type: String, required: true }, // anyone not on this version gets notified

    disabled:      { type: Boolean, default: false }, // true = skip version check entirely (all users pass through)
    forceUpdate:   { type: Boolean, default: false }, // true = block app until updated; false = soft nudge
    updateMessage: { type: String,  default: null },  // custom alert message (optional)
    storeUrl:      { type: String,  default: null },  // App Store / Play Store deep link (optional)

    updatedBy: { type: String, default: null },        // admin email / id
  },
  { timestamps: true }
);

export default mongoose.model("AppVersion", appVersionSchema);
