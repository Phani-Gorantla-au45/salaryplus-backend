import express from "express";
import { adminAuth } from "../../../middlewares/adminAuth.middleware.js";
import { adminGetBankAccount, adminUpdateBankAccount } from "../../../controllers/mf/admin/bankAccount.controller.js";

const router = express.Router();

// GET  /api/mf/admin/bank-account?uniqueId=xxx  — fetch user's current bank account
router.get("/", adminAuth, adminGetBankAccount);

// PATCH /api/mf/admin/bank-account  — update user's bank account + sync folio defaults
router.patch("/", adminAuth, adminUpdateBankAccount);

export default router;
