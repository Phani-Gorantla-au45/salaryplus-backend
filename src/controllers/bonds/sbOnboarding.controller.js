// import SBregister from "../../models/bonds/SBregister.model.js";
// import axios from "axios";
// import crypto from "crypto";
// import jwt from "jsonwebtoken";

// /* ================= UTILITIES ================= */

// /* 🔐 Hash OTP */
// const hashOTP = (otp) => crypto.createHash("sha256").update(otp).digest("hex");

// /* 🔢 Generate OTP */
// const generateOTP = () => Math.floor(1000 + Math.random() * 9000).toString();

// /* 🆔 Generate Unique ID (only once) */
// const generateUniqueId = () => {
//   const timePart = Date.now().toString(36);
//   const randomPart = crypto.randomBytes(5).toString("hex");
//   return "SB" + timePart + randomPart;
// };

// /* 📲 Send OTP via Fast2SMS */
// const sendOTP = async (phone, otp) => {
//   await axios.post(
//     process.env.FAST2SMS_API_URL,
//     {
//       route: "dlt",
//       sender_id: "SPENDI",
//       message: "181034",
//       variables_values: `Your OTP is ${otp}`,
//       numbers: phone,
//     },
//     {
//       headers: {
//         authorization: process.env.FAST2SMS_API_KEY,
//       },
//     },
//   );
// };

// /* ================= 1️⃣ SEND OTP ================= */

// export const sendOtp = async (req, res) => {
//   try {
//     const { phone } = req.body;

//     if (!phone) {
//       return res.status(400).json({
//         success: false,
//         message: "Phone number is required",
//       });
//     }

//     let user = await SBregister.findOne({ phone });

//     // ⛔ Rate limit (30 seconds)
//     if (user?.otpExpiry && user.otpExpiry > Date.now() - 30000) {
//       return res.status(429).json({
//         success: false,
//         message: "Please wait before requesting OTP again",
//       });
//     }

//     const otp = generateOTP();

//     if (!user) {
//       user = new SBregister({ phone });
//     }

//     user.otp = hashOTP(otp);
//     user.otpExpiry = new Date(Date.now() + 5 * 60 * 1000);
//     user.isVerified = false;

//     await user.save();
//     await sendOTP(phone, otp);

//     return res.status(200).json({
//       success: true,
//       message: "OTP sent successfully",
//     });
//   } catch (error) {
//     return res.status(500).json({
//       success: false,
//       message: "Failed to send OTP",
//     });
//   }
// };

// /* ================= 2️⃣ VERIFY OTP ================= */

// export const verifyOtp = async (req, res) => {
//   try {
//     const { phone, otp } = req.body;

//     if (!phone || !otp) {
//       return res.status(400).json({
//         success: false,
//         message: "Phone and OTP are required",
//       });
//     }

//     const user = await SBregister.findOne({
//       phone,
//       otp: hashOTP(otp),
//     });

//     if (!user) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid OTP",
//       });
//     }

//     if (user.otpExpiry < Date.now()) {
//       return res.status(400).json({
//         success: false,
//         message: "OTP expired",
//       });
//     }

//     user.isVerified = true;
//     user.otp = null;
//     user.otpExpiry = null;

//     if (!user.uniqueId) {
//       user.uniqueId = generateUniqueId();
//     }

//     await user.save();

//     const token = jwt.sign(
//       { uniqueId: user.uniqueId },
//       process.env.JWT_SECRET,
//       { expiresIn: "7d" },
//     );

//     // ✅ ONLY return kycStatus
//     return res.status(200).json({
//       success: true,
//       token,
//       kycStatus: user.kycStatus,
//     });
//   } catch (error) {
//     return res.status(500).json({
//       success: false,
//       message: "OTP verification failed",
//     });
//   }
// };

// /* ================= 3️⃣ COMPLETE REGISTRATION ================= */

// export const completeRegistration = async (req, res) => {
//   try {
//     const { fullname, email } = req.body;
//     const { uniqueId } = req.user;

//     if (!fullname || !email) {
//       return res.status(400).json({
//         success: false,
//         message: "Fullname and email are required",
//       });
//     }

//     const user = await SBregister.findOne({ uniqueId });

//     if (!user) {
//       return res.status(404).json({
//         success: false,
//         message: "User not found",
//       });
//     }

//     if (!user.isVerified) {
//       return res.status(401).json({
//         success: false,
//         message: "OTP not verified",
//       });
//     }

//     // ✅ update profile only
//     user.fullname = fullname;
//     user.email = email;

//     // ❌ DO NOT modify kycStatus here

//     await user.save();

//     // ✅ return current DB status
//     return res.status(200).json({
//       success: true,
//       message: "Registration completed",
//       kycStatus: user.kycStatus,
//     });
//   } catch (err) {
//     return res.status(500).json({
//       success: false,
//       message: "Registration failed",
//     });
//   }
// };
import SBregister from "../../models/bonds/SBregister.model.js";
import axios from "axios";
import crypto from "crypto";
import jwt from "jsonwebtoken";

/* ================= UTILITIES ================= */

/* 🔐 Hash OTP */
const hashOTP = (otp) => crypto.createHash("sha256").update(otp).digest("hex");

/* 🔢 Generate OTP */
const generateOTP = () => Math.floor(1000 + Math.random() * 9000).toString();

/* 🆔 Generate Unique ID (only once) */
const generateUniqueId = () => {
  const timePart = Date.now().toString(36);
  const randomPart = crypto.randomBytes(5).toString("hex");
  return "SB" + timePart + randomPart;
};

/* 📲 Send OTP via Fast2SMS */
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
    {
      headers: {
        authorization: process.env.FAST2SMS_API_KEY,
      },
    },
  );
};

/* ================= 1️⃣ SEND OTP ================= */
export const sendOtp = async (req, res) => {
  try {
    console.log("📩 [SEND OTP] API HIT");
    console.log("➡️ Request Body:", req.body);

    const { phone } = req.body;

    if (!phone) {
      console.warn("⚠️ [SEND OTP] Phone number missing");
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
      });
    }

    let user = await SBregister.findOne({ phone });
    console.log("👤 [SEND OTP] Existing user:", user ? "YES" : "NO");

    const now = Date.now();
    console.log("⏱️ [SEND OTP] Timestamp:", new Date(now).toISOString());

    // ✅ Proper rate limit: 30 seconds (currently disabled)
    // if (user?.otpLastSentAt && now - user.otpLastSentAt.getTime() < 30 * 1000) {
    //   console.warn("⛔ [SEND OTP] Rate limited for phone:", phone);
    //   return res.status(429).json({
    //     success: false,
    //     message: "Please wait 30 seconds before requesting OTP again",
    //   });
    // }

    const otp = generateOTP();
    console.log("🔢 [SEND OTP] Generated OTP:", otp); // ❗remove in production

    if (!user) {
      user = new SBregister({ phone });
      console.log("🆕 [SEND OTP] New user document created");
    }

    user.otp = hashOTP(otp);
    user.otpExpiry = new Date(now + 5 * 60 * 1000); // 5 mins
    user.otpLastSentAt = new Date(now);
    user.isVerified = false;

    await user.save();
    console.log("💾 [SEND OTP] OTP data saved to DB");

    await sendOTP(phone, otp);
    console.log("📨 [SEND OTP] OTP sent via SMS gateway");

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully",
    });
  } catch (err) {
    console.error("❌ [SEND OTP] ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to send OTP",
    });
  }
};

/* ================= 2️⃣ VERIFY OTP ================= */

export const verifyOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({
        success: false,
        message: "Phone and OTP are required",
      });
    }

    const user = await SBregister.findOne({
      phone,
      otp: hashOTP(otp),
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    if (user.otpExpiry < Date.now()) {
      return res.status(400).json({
        success: false,
        message: "OTP expired",
      });
    }

    user.isVerified = true;

    // ✅ EMAIL-BASED NEW / OLD USER LOGIC
    // email present  → old user
    // email missing → new user
    user.isNewUser = !user.email;

    user.otp = null;
    user.otpExpiry = null;

    if (!user.uniqueId) {
      user.uniqueId = generateUniqueId();
    }

    await user.save();

    const token = jwt.sign(
      { uniqueId: user.uniqueId },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    return res.status(200).json({
      success: true,
      token,
      kycStatus: user.kycStatus,
      isNewUser: user.isNewUser,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "OTP verification failed",
    });
  }
};

/* ================= 3️⃣ COMPLETE REGISTRATION ================= */

export const completeRegistration = async (req, res) => {
  try {
    const { fullname, email } = req.body;
    const { uniqueId } = req.user;

    if (!fullname || !email) {
      return res.status(400).json({
        success: false,
        message: "Fullname and email are required",
      });
    }

    const user = await SBregister.findOne({ uniqueId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!user.isVerified) {
      return res.status(401).json({
        success: false,
        message: "OTP not verified",
      });
    }

    // ✅ update profile only
    user.fullName = fullname;
    user.email = email;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Registration completed",
      kycStatus: user.kycStatus,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Registration failed",
    });
  }
};
