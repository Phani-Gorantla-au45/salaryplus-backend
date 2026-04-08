import { Router } from "express";
import { adminAuth } from "../../../middlewares/adminAuth.middleware.js";
import {
  listWebhooks,
  createWebhook,
  updateWebhook,
  setupWebhooks,
  updateAllWebhookUrls,
  listStoredEvents,
  replayEvent,
} from "../../../controllers/mf/webhook/fpWebhookManage.controller.js";

const router = Router();

// All admin webhook management routes are protected by admin auth
router.use(adminAuth);

// ── FP Webhook Registration Management ──
router.get("/",        listWebhooks);    // GET  /api/mf/admin/webhook/fp          — list FP webhooks
router.post("/",       createWebhook);   // POST /api/mf/admin/webhook/fp          — register one event
router.put("/:id",     updateWebhook);   // PUT  /api/mf/admin/webhook/fp/:id      — update url/status
router.post("/setup",      setupWebhooks);      // POST /api/mf/admin/webhook/fp/setup       — register all events
router.post("/update-url", updateAllWebhookUrls); // POST /api/mf/admin/webhook/fp/update-url  — bulk fix URL

// ── Stored Event Log ──
router.get("/events",              listStoredEvents); // GET  /api/mf/admin/webhook/fp/events
router.post("/events/:id/replay",  replayEvent);      // POST /api/mf/admin/webhook/fp/events/:id/replay

export default router;
