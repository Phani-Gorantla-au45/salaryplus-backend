import User from "../../models/user/user.model.js";
import { AugmontState } from "../../models/gold/state.model.js";
import axios from "axios";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { sendFounderNote } from "../../utils/mf/webhook/notification.utils.js";

/* 🔐 HASH OTP */
const hashOTP = (otp) => crypto.createHash("sha256").update(otp).digest("hex");

/* 🔢 GENERATE OTP */
const generateOTP = () => Math.floor(1000 + Math.random() * 9000).toString();

/* 📲 SEND OTP SERVICE */
const sendOTP = async (phone, otp) => {
  const payload = {
    route: "dlt",
    sender_id: "SPENDI",
    message: "181034",
    variables_values: `Your OTP is ${otp}`,
    numbers: phone,
  };
  console.log(`\n📤 [SEND OTP] Fast2SMS request — phone: ${phone}`);
  console.log(`📤 [SEND OTP] Payload:`, JSON.stringify(payload, null, 2));
  console.log(`📤 [SEND OTP] API URL: ${process.env.FAST2SMS_API_URL}`);

  const response = await axios.post(process.env.FAST2SMS_API_URL, payload, {
    headers: { authorization: process.env.FAST2SMS_API_KEY },
  });
  console.log(
    `✅ [SEND OTP] Fast2SMS response:`,
    JSON.stringify(response.data, null, 2),
  );
};

/* ---------------- SEND OTP ---------------- */
export const sendOtp = async (req, res) => {
  try {
    const { phone } = req.body;
    console.log(`\n🔐 [SEND OTP] Request for phone: ${phone}`);

    if (!phone) return res.status(400).json({ message: "Phone required" });

    let user = await User.findOne({ phone });
    console.log(`👤 [SEND OTP] User exists: ${!!user}`);

    // ⛔ Rate limit
    if (user?.otpExpiry && user.otpExpiry > Date.now() - 30000) {
      console.log(`⛔ [SEND OTP] Rate limited — otpExpiry: ${user.otpExpiry}`);
      return res.status(429).json({ message: "Wait 1 min before retry" });
    }

    const TEST_NUMBERS = { 8801648801: "1234" };
    const otp = TEST_NUMBERS[phone] ?? generateOTP();
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);

    if (!user) {
      user = new User({ phone });
      user.uniqueId = undefined; // prevent null being stored — sparse index only skips undefined/missing
    }

    user.otp = hashOTP(otp);
    user.otpExpiry = otpExpiry;
    user.isVerified = false;

    await user.save();
    console.log(`💾 [SEND OTP] User saved to DB`);

    if (TEST_NUMBERS[phone]) {
      console.log(
        `🧪 [SEND OTP] Test number ${phone} — skipping SMS, OTP is ${otp}`,
      );
    } else {
      await sendOTP(phone, otp);
    }

    res.json({ message: "OTP sent successfully" });
  } catch (err) {
    console.error(
      `❌ [SEND OTP] Error for phone ${req.body?.phone}:`,
      err.message,
    );
    if (err.response) {
      console.error(
        `❌ [SEND OTP] Fast2SMS error response:`,
        JSON.stringify(err.response.data, null, 2),
      );
    }
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

    // generate uniqueId ONLY ONCE
    if (!user.uniqueId) {
      const generateUniqueId = () => {
        const timePart = Date.now().toString(36);
        const randomPart = crypto.randomBytes(5).toString("hex");
        return "U" + timePart + randomPart;
      };
      user.uniqueId = generateUniqueId();
    }

    await user.save();

    // ✅ JWT WITH uniqueId (NOT _id)
    const token = jwt.sign(
      { uniqueId: user.uniqueId },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

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

/* ---------------- ADMIN LOGIN ---------------- */
export const adminLogin = (req, res) => {
  try {
    const { secret } = req.body;
    if (!secret || secret !== process.env.ADMIN_SECRET) {
      return res.status(401).json({ message: "Invalid admin secret" });
    }

    const token = jwt.sign(
      { uniqueId: "admin", isAdmin: true },
      process.env.JWT_SECRET,
      { expiresIn: "30d" },
    );

    return res.json({ token });
  } catch (err) {
    return res.status(500).json({ message: "Admin login failed" });
  }
};

/* ---------------- GET PROFILE ---------------- */
export const getProfile = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const user = await User.findOne({ uniqueId }).lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    const name =
      [user.First_name, user.Last_name].filter(Boolean).join(" ") || null;

    res.json({
      uniqueId: user.uniqueId,
      phone: user.phone,
      name,
      email: user.email ?? null,
      isVerified: user.isVerified ?? false,
      panVerified: user.panVerified ?? false,
      mfKycStatus: user.mfKycStatus ?? null,
      mfAccount: user.mfAccount ?? "no",
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch profile" });
  }
};

/* ---------------- COMPLETE REGISTRATION ---------------- */
export const completeRegistration = async (req, res) => {
  try {
    const { name, email } = req.body;
    const { uniqueId } = req.user;

    if (!name || !email) {
      return res.status(400).json({ message: "name and email are required" });
    }

    const user = await User.findOne({ uniqueId });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.isVerified)
      return res.status(401).json({ message: "OTP not verified" });

    const parts = name.trim().split(" ");
    user.First_name = parts[0];
    user.Last_name = parts.slice(1).join(" ") || "";
    user.email = email.trim().toLowerCase();

    await user.save();

    // Founder note — fire and forget, never block registration
    sendFounderNote({
      to: email.trim().toLowerCase(),
      name: name.trim(),
    }).catch((err) => console.error("❌ [FOUNDER NOTE] Failed:", err.message));

    res.json({
      message: "Registration completed",
      uniqueId: user.uniqueId,
    });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ message: "Registration failed" });
  }
};
