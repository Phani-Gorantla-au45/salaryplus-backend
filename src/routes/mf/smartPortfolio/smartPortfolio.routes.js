import express from "express";
import { auth } from "../../../middlewares/auth.middleware.js";
import {
  recommendPortfolio,
  savePortfolio,
  getMyPortfolio,
  markInvested,
  listVariants,
} from "../../../controllers/mf/smartPortfolio/smartPortfolio.controller.js";

const router = express.Router();

// POST /api/mf/smart-portfolio/recommend  ← age + horizon → allocation (no DB write)
// POST /api/mf/smart-portfolio/save       ← save recommended portfolio
// GET  /api/mf/smart-portfolio/my         ← fetch user's saved portfolio
// POST /api/mf/smart-portfolio/invest     ← link order ids after investment

router.get( "/variants",  auth, listVariants);      // standard / small availability + display copy
router.post("/recommend", auth, recommendPortfolio);
router.post("/save",      auth, savePortfolio);
router.get( "/my",        auth, getMyPortfolio);
router.post("/invest",    auth, markInvested);

export default router;
