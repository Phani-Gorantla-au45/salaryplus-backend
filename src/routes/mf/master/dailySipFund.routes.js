import express from "express";
import { auth } from "../../../middlewares/auth.middleware.js";
import { adminAuth } from "../../../middlewares/adminAuth.middleware.js";
import {
  listDailySipFunds,
  upsertDailySipFund,
  updateDailySipFund,
  listAllDailySipConfigs,
} from "../../../controllers/mf/master/dailySipFund.controller.js";

const router = express.Router();

// ── Frontend ─────────────────────────────────────────────────────────
// GET /api/mf/master/daily-sip-funds  — fetch all 3 active fund configs
router.get("/", auth, listDailySipFunds);

// ── Admin ─────────────────────────────────────────────────────────────
// POST  /api/mf/master/daily-sip-funds/admin      — configure a fund for a type
// GET   /api/mf/master/daily-sip-funds/admin      — list all configs (history)
// PATCH /api/mf/master/daily-sip-funds/admin/:id  — edit a specific config
router.post(  "/admin",     adminAuth, upsertDailySipFund);
router.get(   "/admin",     adminAuth, listAllDailySipConfigs);
router.patch( "/admin/:id", adminAuth, updateDailySipFund);

export default router;
