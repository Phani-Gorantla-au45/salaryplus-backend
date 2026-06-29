import express from "express";
import { adminAuth } from "../../../middlewares/adminAuth.middleware.js";
import { adminGetKycRequest } from "../../../controllers/mf/admin/kycRequest.controller.js";

const router = express.Router();

// GET /api/mf/admin/kyc-request/:fpKycRequestId — fetch any investor's KYC request
router.get("/:fpKycRequestId", adminAuth, adminGetKycRequest);

export default router;
