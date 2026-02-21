import express from "express";
import {
  submitKyc,
  fetchKycStatus,
} from "../../controllers/bonds/SBkyc.controller.js";
import { auth } from "../../middlewares/jwt.js";

const router = express.Router();

router.post("/submit-kyc", auth, submitKyc);
router.get("/status", auth, fetchKycStatus);
// router.put("/update-status/:uniqueId", updateKycStatus);

export default router;
