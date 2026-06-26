import express from "express";
import {
  renderOrderLinkPage,
  getOrderLinkStatus,
  sendOrderLinkOtp,
  confirmOrderLinkPayment,
  getOrderLinkPaymentStatus,
} from "../../../controllers/mf/public/orderLink.controller.js";

// No auth — secured by the random share token in the URL instead.
const router = express.Router();

router.get("/:token",                  renderOrderLinkPage);
router.get("/:token/status",           getOrderLinkStatus);
router.post("/:token/send-otp",        sendOrderLinkOtp);
router.post("/:token/confirm",         confirmOrderLinkPayment);
router.get("/:token/payment-status",   getOrderLinkPaymentStatus);

export default router;
