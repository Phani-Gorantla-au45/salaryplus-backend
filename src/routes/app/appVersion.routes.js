import express from "express";
import { adminAuth } from "../../middlewares/adminAuth.middleware.js";
import {
  checkVersion,
  upsertVersionConfig,
  getVersionConfigs,
} from "../../controllers/app/appVersion.controller.js";

const router = express.Router();

// ── App (no auth — called on every launch) ──────────────────────────
// GET /api/app/version-check?platform=android&version=1.2.0
router.get("/version-check", checkVersion);

// ── Admin ────────────────────────────────────────────────────────────
// POST /api/app/admin/version  — set/update config for a platform
// GET  /api/app/admin/version  — view all platform configs
router.post("/admin/version", adminAuth, upsertVersionConfig);
router.get( "/admin/version", adminAuth, getVersionConfigs);

export default router;
