import express from "express";
import {
  getSchemePlan,
  listSchemePlans,
  bulkSyncSchemePlans,
  getAmcLogoByIsin,
  getFpSchemePlanRaw,
} from "../../../controllers/mf/master/schemePlan.controller.js";
import { adminAuth } from "../../../middlewares/adminAuth.middleware.js";

const router = express.Router();

// GET  /api/mf/master/scheme-plans              — list cached schemes
// query: ?active=true&type=regular&option=growth&search=hdfc
router.get("/", listSchemePlans);

// POST /api/mf/master/scheme-plans/bulk-sync    — cache multiple ISINs (MUST be before /:isin)
router.post("/bulk-sync", bulkSyncSchemePlans);

// GET  /api/mf/master/scheme-plans/fp/:isin     — raw FP live call, always hits FP (admin only)
router.get("/fp/:isin", adminAuth, getFpSchemePlanRaw);

// GET  /api/mf/master/scheme-plans/:isin/amc-logo — AMC logo for a given ISIN (MUST be before /:isin)
router.get("/:isin/amc-logo", getAmcLogoByIsin);

// GET  /api/mf/master/scheme-plans/:isin        — fetch by ISIN (cache-first, live fallback)
router.get("/:isin", getSchemePlan);

export default router;
