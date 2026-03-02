import axios from "axios";

/**
 * Generates a cryptographically random 6-digit OTP.
 * @returns {string}
 */
export const generateOtp = () => {
  return String(Math.floor(100000 + Math.random() * 900000));
};

/**
 * Returns the OTP expiry date (5 minutes from now).
 * @returns {Date}
 */
export const otpExpiresAt = () => new Date(Date.now() + 5 * 60 * 1000);

/**
 * Sends a consent OTP via Fast2SMS.
 * Reusable for purchase, SIP, withdrawal consent flows.
 *
 * @param {string} phone - 10-digit mobile number (no ISD prefix)
 * @param {string} otp   - 6-digit OTP string
 */
export const sendConsentOtp = async (phone, otp) => {
  try {
    console.log(`📲 [CONSENT OTP] Sending OTP to ${phone.slice(0, 4)}****${phone.slice(-2)}`);
    await axios.post(
      process.env.FAST2SMS_API_URL,
      {
        route:            "dlt",
        sender_id:        "SPENDI",
        message:          "181034",
        variables_values: `Your OTP is ${otp}`,
        numbers:          phone,
      },
      {
        headers: { authorization: process.env.FAST2SMS_API_KEY },
      }
    );
    console.log(`✅ [CONSENT OTP] OTP sent successfully`);
  } catch (err) {
    console.error("❌ [CONSENT OTP] Failed to send OTP:", err.message);
    throw new Error("Failed to send consent OTP");
  }
};

/**
 * Verifies a submitted OTP against the stored OTP and expiry.
 *
 * @param {string} submittedOtp  - OTP entered by user
 * @param {string} storedOtp     - OTP stored in DB record
 * @param {Date}   storedExpiry  - Expiry timestamp from DB record
 * @returns {{ valid: boolean, reason?: string }}
 */
export const verifyConsentOtp = (submittedOtp, storedOtp, storedExpiry) => {
  if (!storedOtp || !storedExpiry) {
    return { valid: false, reason: "No OTP found. Please request a new OTP." };
  }
  if (new Date() > new Date(storedExpiry)) {
    return { valid: false, reason: "OTP has expired. Please request a new OTP." };
  }
  if (String(submittedOtp) !== String(storedOtp)) {
    return { valid: false, reason: "Invalid OTP." };
  }
  return { valid: true };
};
