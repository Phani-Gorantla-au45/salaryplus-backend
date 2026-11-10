import express from "express";
import { auth } from "../../middlewares/auth.middleware.js";
import { getBwBondPortfolio, getBwBondPortfolioSummary } from "../../controllers/bonds/bwBondPortfolio.controller.js";

const router = express.Router();

router.get("/portfolio", auth, getBwBondPortfolio);
// Analytics for the app's "My Bonds": earned till now, avg return, monthly cashflow, active + matured
router.get("/portfolio/summary", auth, getBwBondPortfolioSummary);

export default router;
