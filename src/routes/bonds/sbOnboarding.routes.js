import express from "express";
import {
  sendOtp,
  verifyOtp,
  completeRegistration,
  getUserProfile,
} from "../../controllers/bonds/sbOnboarding.controller.js";
import { auth } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/send-otp", sendOtp);
router.post("/verify-otp", verifyOtp);
router.post("/complete-profile", auth, completeRegistration);
router.get("/profile", auth, getUserProfile);

export default router;
