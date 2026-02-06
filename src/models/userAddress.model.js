import mongoose from "mongoose";

const userAddressSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "RegistrationUser" },
    uniqueId: String, // Augmont user ID
    augmontAddressId: String, // userAddressId from Augmont

    name: String,
    mobileNumber: String,
    email: String,
    address: String,

    stateId: String,
    cityId: String,
    pincode: String,

    status: { type: String, default: "ACTIVE" },
  },
  { timestamps: true },
);

export default mongoose.model("UserAddress", userAddressSchema);
