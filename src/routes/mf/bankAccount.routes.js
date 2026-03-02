import express from "express";
import { createBankAccount, getBankAccount } from "../../controllers/mf/bankAccount.controller.js";
import { auth } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// POST /api/mf/bank-account  — add bank account to investor profile
router.post("/", auth, createBankAccount);

// GET  /api/mf/bank-account  — fetch stored bank account
router.get("/",  auth, getBankAccount);

export default router;
