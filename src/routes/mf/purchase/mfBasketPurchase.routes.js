import express from "express";
import { auth } from "../../../middlewares/auth.middleware.js";
import { createBasketPurchase } from "../../../controllers/mf/purchase/mfBasketPurchase.controller.js";

const router = express.Router();

// POST /api/mf/basket-purchase
// Creates the batch order on FP + sends consent OTP.
// All subsequent steps (confirm, resend-otp, get status) use:
//   POST /api/mf/purchase/:id/confirm
//   POST /api/mf/purchase/:id/resend-otp
//   GET  /api/mf/purchase/:id
router.post("/", auth, createBasketPurchase);

export default router;
