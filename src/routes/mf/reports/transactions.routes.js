import express from "express";
import {
  getTransactions,
  getUserRtaTransactions,
} from "../../../controllers/mf/reports/transactions.controller.js";
import { auth } from "../../../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/",    auth, getTransactions);
router.get("/rta", auth, getUserRtaTransactions);

export default router;
