import express from "express";
import {
  createEmailAddress,
  getEmailAddress,
  sendEmailOtpHandler,
  verifyEmailOtp,
} from "../../../controllers/mf/onboarding/emailAddress.controller.js";
import { auth } from "../../../middlewares/auth.middleware.js";

const router = express.Router();

// OTP flow (new — preferred)
router.post("/send-otp",   auth, sendEmailOtpHandler); // Step 1: send OTP
router.post("/verify-otp", auth, verifyEmailOtp);      // Step 2: verify OTP + creates FP object

// Direct create (kept for backward compatibility)
router.post("/", auth, createEmailAddress);

// GET  /api/mf/email-address  — fetch stored email
router.get("/", auth, getEmailAddress);

export default router;
