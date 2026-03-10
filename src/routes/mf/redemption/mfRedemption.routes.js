import express from "express";
import {
  createRedemption,
  confirmRedemption,
  resendRedemptionOtp,
  getRedemption,
  listRedemptions,
  getRedemptionSummary,
} from "../../../controllers/mf/redemption/mfRedemption.controller.js";
import { auth } from "../../../middlewares/auth.middleware.js";

const router = express.Router();

// Summary must be before /:id so Express doesn't treat "summary" as an id
router.get("/summary",        auth, getRedemptionSummary);

router.post("/",              auth, createRedemption);
router.get("/",               auth, listRedemptions);
router.get("/:id",            auth, getRedemption);
router.post("/:id/confirm",   auth, confirmRedemption);
router.post("/:id/resend-otp",auth, resendRedemptionOtp);

export default router;
