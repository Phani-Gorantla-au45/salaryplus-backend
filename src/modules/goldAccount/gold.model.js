import mongoose from "mongoose";

export default mongoose.model(
  "GoldAccount",
  new mongoose.Schema(
    {
      uniqueId: String,
      firstName: String,
      lastName: String,
      email: String,
      phone: String,
      userState: String,
      userName: String,
      augmontUserId: String,
      status: { type: String, default: "ACTIVE" },
    },
    { timestamps: true },
  ),
);
