import { Router } from "express";
import { receiveFpWebhook } from "../../../controllers/mf/webhook/fpWebhook.controller.js";

const router = Router();

/**
 * POST /api/mf/webhook/fp
 *
 * Public endpoint — intentionally no JWT auth middleware.
 * Security is enforced by verifying the FP-Signature header (HMAC-SHA256).
 */
router.post("/", receiveFpWebhook);

export default router;
