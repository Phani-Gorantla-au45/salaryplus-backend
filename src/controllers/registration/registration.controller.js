import User from "../../models/registration.model.js";
import axios from "axios";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";

/* 🔐 HASH OTP */
const hashOTP = (otp) => crypto.createHash("sha256").update(otp).digest("hex");

/* 🔢 GENERATE OTP */
const generateOTP = () => Math.floor(1000 + Math.random() * 9000).toString();

/* 📲 SEND OTP SERVICE */
const sendOTP = async (phone, otp) => {
  await axios.post(
    process.env.FAST2SMS_API_URL,
    {
      route: "dlt",
      sender_id: "SPENDI",
      message: "181034",
      variables_values: `Your OTP is ${otp}`,
      numbers: phone,
    },
    { headers: { authorization: process.env.FAST2SMS_API_KEY } },
  );
};

/* ---------------- SEND OTP ---------------- */
export const sendOtp = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ message: "Phone required" });

    let user = await User.findOne({ phone });

    // ⛔ Rate limit
    if (user?.otpExpiry && user.otpExpiry > Date.now() - 30000)
      return res.status(429).json({ message: "Wait 1 min before retry" });

    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);

    if (!user) user = new User({ phone });

    user.otp = hashOTP(otp);
    user.otpExpiry = otpExpiry;
    user.isVerified = false;
    await user.save();

    await sendOTP(phone, otp);

    res.json({ message: "OTP sent successfully" });
  } catch (err) {
    res.status(500).json({ message: "OTP send failed", error: err.message });
  }
};

/* ---------------- VERIFY OTP ---------------- */
export const verifyOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    const hashedOTP = hashOTP(otp);

    const user = await User.findOne({ phone, otp: hashedOTP });
    if (!user) return res.status(400).json({ message: "Invalid OTP" });

    if (user.otpExpiry < Date.now())
      return res.status(400).json({ message: "OTP expired" });

    user.isVerified = true;
    user.otp = null;
    user.otpExpiry = null;
    await user.save();

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    const isProfileComplete = user.First_name && user.Last_name && user.email;

    res.json({
      token,
      isNewUser: !isProfileComplete,
      nextStep: isProfileComplete ? "HOME" : "REGISTRATION",
    });
  } catch (err) {
    res.status(500).json({ message: "OTP verification failed" });
  }
};

/* ---------------- COMPLETE REGISTRATION ---------------- */
export const completeRegistration = async (req, res) => {
  try {
    const { First_name, Last_name, email, stateId } = req.body;
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user.isVerified)
      return res.status(401).json({ message: "OTP not verified" });

    if (user.uniqueId)
      return res.status(400).json({ message: "Already registered" });

    user.uniqueId = uuidv4(); // 🔥 GENERATED HERE
    user.First_name = First_name;
    user.Last_name = Last_name;
    user.email = email;
    user.stateId = stateId;

    await user.save();

    res.json({
      message: "Registration completed",
      uniqueId: user.uniqueId, // frontend can store if needed
    });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ message: "Registration failed" });
  }
};
