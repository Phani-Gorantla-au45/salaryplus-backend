import express from "express";
import { auth } from "../../../middlewares/auth.middleware.js";
import { adminAuth } from "../../../middlewares/adminAuth.middleware.js";
import {
  getSmartSaving,
  upsertSmartSaving,
  updateSmartSaving,
  listSmartSavingConfigs,
} from "../../../controllers/mf/smartSaving/smartSaving.controller.js";

const router = express.Router();

// ── Frontend (user-facing) ──────────────────────────────────────────
// GET /api/mf/smart-saving  — fetch the active instant liquid fund config
router.get("/", auth, getSmartSaving);

// ── Admin ───────────────────────────────────────────────────────────
// POST   /api/mf/admin/smart-saving      — set a new active fund (deactivates old)
// GET    /api/mf/admin/smart-saving      — list all configs (history)
// PATCH  /api/mf/admin/smart-saving/:id  — edit a specific config
router.post(  "/admin",     adminAuth, upsertSmartSaving);
router.get(   "/admin",     adminAuth, listSmartSavingConfigs);
router.patch( "/admin/:id", adminAuth, updateSmartSaving);

export default router;
