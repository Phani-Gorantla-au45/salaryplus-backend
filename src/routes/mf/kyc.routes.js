import express from "express";
import {
  checkPanKyc,
  getKycStatus,
} from "../../controllers/mf/kyc.controller.js";
import { auth } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// POST /api/mf/kyc/check-pan — trigger PAN validation (PAN + name + DOB)
router.post("/check-pan", auth, checkPanKyc);

// GET /api/mf/kyc/status — fetch stored KRA status
router.get("/status", auth, getKycStatus);

export default router;
