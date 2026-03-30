import express from "express";
import {
  createPhoneNumber,
  getPhoneNumber,
  sendPhoneOtp,
  verifyPhoneOtp,
} from "../../../controllers/mf/onboarding/phoneNumber.controller.js";
import { auth } from "../../../middlewares/auth.middleware.js";

const router = express.Router();

// OTP flow (new — preferred)
router.post("/send-otp",   auth, sendPhoneOtp);    // Step 1: send OTP
router.post("/verify-otp", auth, verifyPhoneOtp);  // Step 2: verify OTP + creates FP object

// Direct create (kept for backward compatibility)
router.post("/", auth, createPhoneNumber);

// GET  /api/mf/phone-number  — fetch stored phone number
router.get("/", auth, getPhoneNumber);

export default router;
