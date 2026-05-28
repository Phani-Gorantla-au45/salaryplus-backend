import express from "express";
import { listTransactions } from "../../controllers/mf/transactions.controller.js";
import { auth } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/", auth, listTransactions);

export default router;
