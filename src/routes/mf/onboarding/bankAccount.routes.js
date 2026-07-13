import express from "express";
import multer from "multer";
import { createBankAccount, getBankAccount, uploadBankProof, updateBankAccount } from "../../../controllers/mf/onboarding/bankAccount.controller.js";
import { auth } from "../../../middlewares/auth.middleware.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// POST /api/mf/bank-account/upload-proof  — NRI only: upload bank proof to Cybrilla POA files
router.post("/upload-proof", auth, upload.single("file"), uploadBankProof);

// POST /api/mf/bank-account  — add bank account to investor profile
router.post("/", auth, createBankAccount);

// GET  /api/mf/bank-account  — fetch stored bank account
router.get("/",  auth, getBankAccount);

// PATCH /api/mf/bank-account — update bank account + sync MF investment account folio defaults
router.patch("/", auth, updateBankAccount);

export default router;
