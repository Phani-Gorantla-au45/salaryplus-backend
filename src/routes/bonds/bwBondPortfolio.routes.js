import express from "express";
import { auth } from "../../middlewares/auth.middleware.js";
import { getBwBondPortfolio, getBwBondPortfolioSummary, getBondPayoutSchedule } from "../../controllers/bonds/bwBondPortfolio.controller.js";

const router = express.Router();

router.get("/portfolio", auth, getBwBondPortfolio);
// Analytics for the app's "My Bonds": earned till now, avg return, monthly cashflow, active + matured
router.get("/portfolio/summary", auth, getBwBondPortfolioSummary);
// Payout schedule for a specific bond: paid + upcoming installments
router.get("/portfolio/:isin/schedule", auth, getBondPayoutSchedule);

export default router;
