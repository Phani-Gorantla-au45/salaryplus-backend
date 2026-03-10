import express from "express";
import { getTransactions } from "../../../controllers/mf/reports/transactions.controller.js";
import { auth } from "../../../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/", auth, getTransactions);

export default router;
