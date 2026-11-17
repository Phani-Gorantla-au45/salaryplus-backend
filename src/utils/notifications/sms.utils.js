import axios from "axios";
import { sendOtpSms } from "./otpSms.utils.js";

/**
 * Send an SMS via Fast2SMS
 * @param {string} phone  - 10-digit mobile number (no country code)
 * @param {string} otp    - OTP string to embed in message
 */
export const sendSmsOtp = async (phone, otp) => {
  await sendOtpSms(phone, otp, "txn");
};
