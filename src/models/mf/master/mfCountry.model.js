import mongoose from "mongoose";

const mfCountrySchema = new mongoose.Schema(
  {
    name:     { type: String, required: true, trim: true },
    ansiCode: { type: String, required: true, uppercase: true, trim: true, unique: true, index: true },
  },
  { timestamps: true }
);

export default mongoose.model("MfCountry", mfCountrySchema);
