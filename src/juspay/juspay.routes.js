import express from "express";
import { createMetalIntent } from "../juspay/metalcreateorder.js";
import { auth } from "../middlewares/jwt.js";
import { verifyVpa360 } from "./verifyVpa.controller.js";
import { createWebCollect } from "./webCollect.controller.js";
import { getTransactionStatus360 } from "./transactionStatus.controller.js";
import { markPaymentFailed } from "./paymentFailure.controller.js";
const router = express.Router();

router.post("/metal/intent", auth, createMetalIntent);
router.post("/verify-vpa", auth, verifyVpa360);
router.post("/web-collect", auth, createWebCollect);
router.post("/transaction-status", auth, getTransactionStatus360);
router.post("/payment-failed", auth, markPaymentFailed);
export default router;
