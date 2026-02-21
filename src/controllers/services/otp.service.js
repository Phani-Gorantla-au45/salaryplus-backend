import axios from "axios";

/* 📲 SEND OTP SERVICE (COMMON) */
export const sendOTP = async (phone, otp) => {
  try {
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
  } catch (error) {
    console.error("OTP SEND FAILED:", error.message);
    throw new Error("Failed to send OTP");
  }
};
