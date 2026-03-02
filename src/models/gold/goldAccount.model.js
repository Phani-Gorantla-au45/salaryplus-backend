import mongoose from "mongoose";

export default mongoose.model(
  "GoldAccount",
  new mongoose.Schema(
    {
      uniqueId: String,
      augmontUserId: String, // customerMappedId

      firstName: String,
      lastName: String,
      email: String,
      phone: String,
      userName: String,

      augmontStateId: String,
      augmontStateName: String,
      userCityName: String,
      userCityId: String,
      userPincode: String,
      dateOfBirth: Date,

      kycStatus: { type: String, default: "Pending" },

      status: { type: String, default: "ACTIVE" },
    },
    { timestamps: true },
  ),
);
