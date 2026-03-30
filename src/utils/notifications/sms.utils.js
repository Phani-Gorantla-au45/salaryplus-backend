import axios from "axios";

/**
 * Send an SMS via Fast2SMS
 * @param {string} phone  - 10-digit mobile number (no country code)
 * @param {string} otp    - OTP string to embed in message
 */
export const sendSmsOtp = async (phone, otp) => {
  await axios.post(
    process.env.FAST2SMS_API_URL,
    {
      route:            "dlt",
      sender_id:        "SPENDI",
      message:          "181034",
      variables_values: `Your OTP is ${otp}`,
      numbers:          String(phone),
    },
    { headers: { authorization: process.env.FAST2SMS_API_KEY } }
  );
};
