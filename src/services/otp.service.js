import axios from "axios";
import { sendOtpSms } from "../utils/notifications/otpSms.utils.js";

/* 📲 SEND OTP SERVICE (COMMON) */
export const sendOTP = async (phone, otp) => {
  try {
    await sendOtpSms(phone, otp, "login");
  } catch (error) {
    console.error("OTP SEND FAILED:", error.message);
    throw new Error("Failed to send OTP");
  }
};
