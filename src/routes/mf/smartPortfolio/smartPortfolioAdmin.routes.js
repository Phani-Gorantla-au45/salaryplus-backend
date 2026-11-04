import express from "express";
import { adminAuth } from "../../../middlewares/adminAuth.middleware.js";
import {
  getConfig,
  updateConfig,
  updateFormula,
  listUserPortfolios,
  getUserPortfolio,
  assignPortfolio,
} from "../../../controllers/mf/smartPortfolio/smartPortfolioAdmin.controller.js";

const router = express.Router();

// Fund config (which funds go in equity / debt / gold)
router.get( "/config",           adminAuth, getConfig);
router.post("/config",           adminAuth, updateConfig);

// Allocation formula (how % is calculated per risk level)
router.post("/formula",          adminAuth, updateFormula);

// User portfolios
router.get( "/users",            adminAuth, listUserPortfolios);
router.get( "/users/:uniqueId",  adminAuth, getUserPortfolio);
router.post("/assign",           adminAuth, assignPortfolio);

export default router;
