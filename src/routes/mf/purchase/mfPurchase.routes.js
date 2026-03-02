import express from "express";
import { auth } from "../../../middlewares/auth.middleware.js";
import {
  createPurchase,
  confirmPurchase,
  resendOtp,
  getPurchase,
  listPurchases,
  paymentCallback,
} from "../../../controllers/mf/purchase/mfPurchase.controller.js";

const router = express.Router();

// POST /api/mf/purchase/payment-callback  — FP payment postback (no auth, MUST be before /:id)
router.post("/payment-callback", paymentCallback);

// GET  /api/mf/purchase                   — list user's purchases
router.get("/", auth, listPurchases);

// POST /api/mf/purchase                   — create purchase order + send OTP
router.post("/", auth, createPurchase);

// GET  /api/mf/purchase/:id               — get single purchase (refresh from FP)
router.get("/:id", auth, getPurchase);

// POST /api/mf/purchase/:id/confirm       — verify OTP + payment + confirm
router.post("/:id/confirm", auth, confirmPurchase);

// POST /api/mf/purchase/:id/resend-otp    — resend consent OTP
router.post("/:id/resend-otp", auth, resendOtp);

export default router;
