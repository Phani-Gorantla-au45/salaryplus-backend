import express from "express";
import { getJourneyStatus } from "../../controllers/mf/journeyStatus.controller.js";
import { auth } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// GET /api/mf/journey-status — returns all stage flags + currentStep + canInvest
router.get("/", auth, getJourneyStatus);

export default router;
