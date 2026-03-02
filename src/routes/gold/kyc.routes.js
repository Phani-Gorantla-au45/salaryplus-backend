import express from "express";
import { auth } from "../../middlewares/auth.middleware.js";

import {
  verifyPan,
  verifyfullPan,
  pushAugmontKyc,
  //completeKycFlow,
} from "../../controllers/gold/kyc.controller.js";

const router = express.Router();

router.post("/verify-pan", auth, verifyPan);

router.post("/verifyfullpan", auth, verifyfullPan);
router.post("/augmont-kyc", auth, pushAugmontKyc);
// 🔥 Main endpoint user clicks
// router.post("/complete-kyc", auth, completeKycFlow);

export default router;
