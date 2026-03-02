import express from "express";
import {
  createMfInvestmentAccount,
  getMfInvestmentAccount,
  updateMfInvestmentAccount,
} from "../../controllers/mf/mfInvestmentAccount.controller.js";
import { auth } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// POST /api/mf/investment-account  — create MF investment account (auto-wires all folio defaults)
router.post("/", auth, createMfInvestmentAccount);

// GET  /api/mf/investment-account  — fetch & refresh from FP
router.get("/",  auth, getMfInvestmentAccount);

// PATCH /api/mf/investment-account  — re-sync folio_defaults from DB → FP
router.patch("/", auth, updateMfInvestmentAccount);

export default router;
