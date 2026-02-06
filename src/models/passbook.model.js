import mongoose from "mongoose";

const passbookSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RegistrationUser",
      required: true,
      unique: true,
    },
    uniqueId: {
      type: String,
      required: true,
      unique: true,
    },

    goldBalance: {
      type: Number,
      default: 0,
    },
    silverBalance: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

export default mongoose.model("Passbook", passbookSchema);
