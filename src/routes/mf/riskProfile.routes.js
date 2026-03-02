import express from "express";
import {
  getQuestions,
  submitRiskProfile,
  getRiskProfileStatus,
} from "../../controllers/mf/riskProfile.controller.js";
import { auth } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// GET  /api/mf/risk-profile/questions  — fetch all questions (no auth needed)
router.get("/questions",  getQuestions);

// POST /api/mf/risk-profile/submit     — submit answers, get score + category
router.post("/submit",    auth, submitRiskProfile);

// GET  /api/mf/risk-profile/status     — fetch user's stored risk profile result
router.get("/status",     auth, getRiskProfileStatus);

export default router;
