import express from "express";
import {
  getSchemePlan,
  listSchemePlans,
  bulkSyncSchemePlans,
} from "../../../controllers/mf/master/schemePlan.controller.js";

const router = express.Router();

// GET  /api/mf/master/scheme-plans              — list cached schemes
// query: ?active=true&type=regular&option=growth&search=hdfc
router.get("/", listSchemePlans);

// POST /api/mf/master/scheme-plans/bulk-sync    — cache multiple ISINs (MUST be before /:isin)
router.post("/bulk-sync", bulkSyncSchemePlans);

// GET  /api/mf/master/scheme-plans/:isin        — fetch by ISIN (cache-first, live fallback)
router.get("/:isin", getSchemePlan);

export default router;
