import express from "express";
import { listAmcs, syncAmcs } from "../../../controllers/mf/master/amc.controller.js";

const router = express.Router();

// GET  /api/mf/master/amcs          — list all AMCs (auto-syncs if stale)
// query: ?active=true
router.get("/", listAmcs);

// POST /api/mf/master/amcs/sync     — force re-sync from FP
router.post("/sync", syncAmcs);

export default router;
