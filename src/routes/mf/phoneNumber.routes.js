import express from "express";
import {
  createPhoneNumber,
  getPhoneNumber,
} from "../../controllers/mf/phoneNumber.controller.js";
import { auth } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// POST /api/mf/phone-number  — link phone to investor profile
router.post("/", auth, createPhoneNumber);

// GET  /api/mf/phone-number  — fetch stored phone number
router.get("/",  auth, getPhoneNumber);

export default router;
