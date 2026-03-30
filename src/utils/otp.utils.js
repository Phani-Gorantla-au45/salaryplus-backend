import crypto from "crypto";

/** Generate a 4-digit OTP string */
export const generateOtp = () =>
  Math.floor(1000 + Math.random() * 9000).toString();

/** Hash an OTP for safe storage */
export const hashOtp = (otp) =>
  crypto.createHash("sha256").update(otp).digest("hex");

/** Verify a plain OTP against a stored hash */
export const verifyOtp = (plain, hashed) =>
  hashOtp(plain) === hashed;

/** OTP expiry — 10 minutes from now */
export const otpExpiresAt = () =>
  new Date(Date.now() + 10 * 60 * 1000);
