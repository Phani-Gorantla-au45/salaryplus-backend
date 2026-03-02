import express from "express";
import { createEsign, getEsign } from "../../controllers/mf/esign.controller.js";
import { auth } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// POST /api/mf/esign       — create esign for a kyc_request in esign_required state
router.post("/",          auth, createEsign);

// GET  /api/mf/esign/:id   — poll status after user completes signing
router.get("/:fpEsignId", auth, getEsign);

export default router;
