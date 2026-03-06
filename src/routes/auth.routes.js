import express from "express";
import {
  sendOtp,
  verifyOtp,
  completeRegistration,
  adminLogin,
} from "../controllers/auth/auth.controller.js";
import { auth } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/send-otp", sendOtp);
router.post("/verify-otp", verifyOtp);
router.post("/complete-profile", auth, completeRegistration);
router.post("/admin/login", adminLogin);

export default router;
