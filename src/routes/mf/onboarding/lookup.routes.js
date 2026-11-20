import express from "express";
import { createLookup, getLookups } from "../../../controllers/mf/onboarding/lookup.controller.js";
import { auth } from "../../../middlewares/auth.middleware.js";

const router = express.Router();

// POST /api/mf/lookup — fetch KYC / bank details from FP lookup APIs (needs consent: true)
router.post("/", auth, createLookup);

// GET /api/mf/lookup — latest lookup results
router.get("/", auth, getLookups);

export default router;
