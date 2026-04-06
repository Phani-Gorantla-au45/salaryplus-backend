import mongoose from "mongoose";

const appVersionSchema = new mongoose.Schema(
  {
    platform: {
      type:     String,
      required: true,
      enum:     ["ios", "android"],
      unique:   true,   // one active config per platform
    },

    minRequiredVersion: { type: String, required: true }, // below this = force update  e.g. "1.2.0"
    latestVersion:      { type: String, required: true }, // below this = soft update   e.g. "1.5.0"

    forceUpdate:   { type: Boolean, default: false },  // override — force all users regardless of version
    updateMessage: { type: String,  default: null },   // custom alert message
    storeUrl:      { type: String,  required: true },  // App Store / Play Store deep link

    updatedBy: { type: String, default: null },        // admin email / id
  },
  { timestamps: true }
);

export default mongoose.model("AppVersion", appVersionSchema);
