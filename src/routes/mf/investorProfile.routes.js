import express from "express";
import {
  getAccountEnums,
  createInvestorProfile,
  updateInvestorProfile,
  getInvestorProfile,
} from "../../controllers/mf/investorProfile.controller.js";
import { auth } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// GET  /api/mf/investor-profile/enums  — dropdown values (no auth needed)
router.get("/enums",  getAccountEnums);

// POST /api/mf/investor-profile        — create investor profile
router.post("/",      auth, createInvestorProfile);

// PATCH /api/mf/investor-profile       — update investor profile
router.patch("/",     auth, updateInvestorProfile);

// GET  /api/mf/investor-profile        — fetch & refresh investor profile
router.get("/",       auth, getInvestorProfile);

export default router;
