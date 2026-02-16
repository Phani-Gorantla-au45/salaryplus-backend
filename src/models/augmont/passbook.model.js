import mongoose from "mongoose";

const passbookSchema = new mongoose.Schema(
  {
    uniqueId: String,
    goldBalance: Number,
    silverBalance: Number,
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (ret) {
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

export default mongoose.model("Passbook", passbookSchema);
