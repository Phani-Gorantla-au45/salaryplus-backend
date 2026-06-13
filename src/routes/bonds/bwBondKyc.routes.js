import express from "express";
import {
  submitBwBondKyc,
  getBwBondKycStatus,
} from "../../controllers/bonds/bwBondKyc.controller.js";
import { auth } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/submit", auth, submitBwBondKyc);
router.get("/status", auth, getBwBondKycStatus);

export default router;
