import express from "express";
import {
  createKycRequest,
  updateKycRequest,
  getKycRequest,
  getKycResume,
  listKycRequests,
  simulateKycRequest,
} from "../../controllers/mf/kycRequest.controller.js";
import { auth } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// POST   /api/mf/kyc-request            — create a new KYC request
router.post("/",                 auth, createKycRequest);

// GET    /api/mf/kyc-request            — list all KYC requests for the user
router.get("/",                  auth, listKycRequests);

// GET    /api/mf/kyc-request/resume     — resume mid-flow (MUST be before /:fpKycRequestId)
router.get("/resume",            auth, getKycResume);

// GET    /api/mf/kyc-request/:id        — fetch & refresh a specific KYC request
router.get("/:fpKycRequestId",   auth, getKycRequest);

// PATCH  /api/mf/kyc-request/:id        — update a KYC request (incremental)
router.patch("/:fpKycRequestId", auth, updateKycRequest);

// POST   /api/mf/kyc-request/:id/simulate  — sandbox only
router.post("/:fpKycRequestId/simulate", auth, simulateKycRequest);

export default router;
