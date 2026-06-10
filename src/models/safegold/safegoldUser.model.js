import mongoose from "mongoose";

const safegoldUserSchema = new mongoose.Schema(
  {
    // Link to our RegistrationUser
    uniqueId: { type: String, required: true, unique: true, index: true },

    // SafeGold's own user id (returned on registration)
    safegoldUserId: { type: Number, default: null },

    // Registration data mirrored from SafeGold response
    name:     { type: String, default: null },
    mobileNo: { type: String, default: null },
    email:    { type: String, default: null },
    pinCode:  { type: String, default: null },

    // Gold balance in grams (synced from SafeGold after every transaction)
    goldBalance:      { type: Number, default: 0 },
    sellableBalance:  { type: Number, default: 0 }, // may differ if holding period applies
    balanceSyncedAt:  { type: Date,   default: null },

    // KYC requirement flags from SafeGold
    kyc: {
      identityRequired: { type: Boolean, default: false },
      panRequired:      { type: Boolean, default: false },
    },

    // Registration status
    isRegistered: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model("SafegoldUser", safegoldUserSchema);
