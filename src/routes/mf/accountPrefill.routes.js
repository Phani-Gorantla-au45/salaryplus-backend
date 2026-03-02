import express from "express";
import { getAccountPrefill } from "../../controllers/mf/accountPrefill.controller.js";
import { auth } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// GET /api/mf/account/prefill  — pre-fill + completion status for account setup
router.get("/prefill", auth, getAccountPrefill);

export default router;
