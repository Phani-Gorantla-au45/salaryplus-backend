import express from "express";
import { adminAuth } from "../../../middlewares/adminAuth.middleware.js";
import { listTransactionsAdmin } from "../../../controllers/mf/admin/transactions.controller.js";

const router = express.Router();

router.get("/:uniqueId", adminAuth, listTransactionsAdmin);

export default router;
