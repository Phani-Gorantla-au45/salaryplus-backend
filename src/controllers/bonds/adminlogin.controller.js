import crypto from "crypto";
import jwt from "jsonwebtoken";
import Admin from "../../models/bonds/adminlogin.model.js";
import { sendOTP } from "../../controllers/services/otp.service.js";

/* ================= UTIL FUNCTIONS ================= */

const generateOTP = () => Math.floor(1000 + Math.random() * 9000).toString();

const hashOTP = (otp) => crypto.createHash("sha256").update(otp).digest("hex");

/* ================= SEND ADMIN OTP ================= */

export const adminSendOtp = async (req, res) => {
  try {
    const { phone } = req.body;

    // 🔒 only allowed admin number
    if (phone !== process.env.ADMIN_PHONE) {
      return res.status(403).json({
        success: false,
        message: "Not authorized as admin",
      });
    }

    let admin = await Admin.findOne({ phone });

    const otp = generateOTP();

    if (!admin) {
      admin = new Admin({ phone });
    }

    admin.otp = hashOTP(otp);
    admin.otpExpiry = new Date(Date.now() + 5 * 60 * 1000);
    admin.isVerified = false;

    await admin.save();

    // ✅ reuse common OTP service
    await sendOTP(phone, otp);

    return res.status(200).json({
      success: true,
      message: "Admin OTP sent successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to send admin OTP",
    });
  }
};

/* ================= VERIFY ADMIN OTP ================= */

export const adminVerifyOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    const admin = await Admin.findOne({
      phone,
      otp: hashOTP(otp),
    });

    if (!admin) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    if (admin.otpExpiry < Date.now()) {
      return res.status(400).json({
        success: false,
        message: "OTP expired",
      });
    }

    admin.isVerified = true;
    admin.otp = null;
    admin.otpExpiry = null;

    if (!admin.uniqueId) {
      admin.uniqueId = "ADM" + Date.now();
    }

    await admin.save();

    const token = jwt.sign(
      {
        uniqueId: admin.uniqueId,
        isAdmin: true,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    return res.status(200).json({
      success: true,
      token,
      uniqueId: admin.uniqueId,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Admin login failed",
    });
  }
};
