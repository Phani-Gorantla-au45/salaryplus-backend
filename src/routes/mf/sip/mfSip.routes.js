import express from "express";
import {
  createSip,
  confirmSip,
  resendSipOtp,
  getSip,
  listSips,
  cancelSip,
} from "../../../controllers/mf/sip/mfSip.controller.js";
import {
  createSkipInstruction,
  listSkipInstructions,
  cancelSkipInstruction,
} from "../../../controllers/mf/sip/skipInstruction.controller.js";
import {
  payFirstInstallment,
  getFirstInstallmentStatus,
} from "../../../controllers/mf/sip/sipFirstInstallment.controller.js";
import { auth } from "../../../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/",                                    auth, createSip);
router.get("/",                                     auth, listSips);

// Skip instruction cancel — must be before /:id to avoid route conflict
router.post("/skip/:skipId/cancel",                 auth, cancelSkipInstruction);

router.get("/:id",                                  auth, getSip);
router.post("/:id/confirm",                         auth, confirmSip);
router.post("/:id/resend-otp",                      auth, resendSipOtp);
router.post("/:id/cancel",                          auth, cancelSip);

// Skip instructions
router.post("/:sipId/skip",                         auth, createSkipInstruction);
router.get("/:sipId/skip",                          auth, listSkipInstructions);

// First installment payment (single + basket SIP)
router.post("/:sipId/first-installment",            auth, payFirstInstallment);
router.get("/:sipId/first-installment/status",      auth, getFirstInstallmentStatus);

export default router;
