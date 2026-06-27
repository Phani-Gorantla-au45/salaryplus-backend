import express from "express";
import { adminAuth } from "../../../middlewares/adminAuth.middleware.js";
import {
  getTransactionListReport,
  getPurchaseListReport,
  getRedemptionListReport,
} from "../../../controllers/mf/admin/listReports.controller.js";

const router = express.Router();

router.get("/transactions", adminAuth, getTransactionListReport);
router.get("/purchases",    adminAuth, getPurchaseListReport);
router.get("/redemptions",  adminAuth, getRedemptionListReport);

export default router;
