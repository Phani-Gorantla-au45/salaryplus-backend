import express from "express";
import {
  createBasketSip,
  confirmBasketSip,
  resendBasketSipOtp,
  getBasketSip,
  listBasketSips,
  cancelBasketSip,
} from "../../../controllers/mf/sip/mfBasketSip.controller.js";
import { auth } from "../../../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/",                  auth, createBasketSip);
router.get("/",                   auth, listBasketSips);
router.get("/:id",                auth, getBasketSip);
router.post("/:id/confirm",       auth, confirmBasketSip);
router.post("/:id/resend-otp",    auth, resendBasketSipOtp);
router.post("/:id/cancel",        auth, cancelBasketSip);

export default router;
