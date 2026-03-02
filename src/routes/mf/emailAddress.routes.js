import express from "express";
import { createEmailAddress, getEmailAddress } from "../../controllers/mf/emailAddress.controller.js";
import { auth } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// POST /api/mf/email-address  — link email to investor profile
router.post("/", auth, createEmailAddress);

// GET  /api/mf/email-address  — fetch stored email
router.get("/",  auth, getEmailAddress);

export default router;
