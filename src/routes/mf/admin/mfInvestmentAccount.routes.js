import express from "express";
import { adminAuth } from "../../../middlewares/adminAuth.middleware.js";
import { listInvestmentAccounts } from "../../../controllers/mf/admin/mfInvestmentAccount.controller.js";

const router = express.Router();

router.get("/", adminAuth, listInvestmentAccounts);

export default router;
