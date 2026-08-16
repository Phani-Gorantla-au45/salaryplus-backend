import express from "express";
import { adminAuth } from "../../middlewares/adminAuth.middleware.js";
import {
  previewEmail,
  sendCampaign,
  listCampaigns,
  getCampaign,
  listEmailableUsers,
} from "../../controllers/admin/emailBroadcast.controller.js";

const router = express.Router();

// GET  /api/admin/email/users            — list users with emails (for recipient picker)
router.get("/users",            adminAuth, listEmailableUsers);

// GET  /api/admin/email/campaigns        — list sent campaigns
router.get("/campaigns",        adminAuth, listCampaigns);

// GET  /api/admin/email/campaigns/:id   — get one campaign (with HTML body)
router.get("/campaigns/:id",    adminAuth, getCampaign);

// POST /api/admin/email/preview          — send test email to default/specified address
router.post("/preview",         adminAuth, previewEmail);

// POST /api/admin/email/send             — send campaign (responds 202, sends in background)
router.post("/send",            adminAuth, sendCampaign);

export default router;
