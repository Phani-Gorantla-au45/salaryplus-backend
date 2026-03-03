import express from "express";
import {
  submitKyc,
  fetchKycStatus,
} from "../../controllers/bonds/SBkyc.controller.js";
import { auth } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/submit-kyc", auth, submitKyc);
router.get("/status", auth, fetchKycStatus);

export default router;
