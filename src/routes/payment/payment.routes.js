import express from "express";
import { createMetalIntent } from "../../controllers/payment/createOrder.controller.js";
import { auth } from "../../middlewares/auth.middleware.js";
import { verifyVpa360 } from "../../controllers/payment/verifyVpa.controller.js";
import { createWebCollect } from "../../controllers/payment/webCollect.controller.js";
import { getTransactionStatus360 } from "../../controllers/payment/transactionStatus.controller.js";
import { markPaymentFailed } from "../../controllers/payment/paymentFailure.controller.js";

const router = express.Router();

router.post("/metal/intent", auth, createMetalIntent);
router.post("/verify-vpa", auth, verifyVpa360);
router.post("/web-collect", auth, createWebCollect);
router.post("/transaction-status", auth, getTransactionStatus360);
router.post("/payment-failed", auth, markPaymentFailed);

export default router;
