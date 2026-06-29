import express from "express";
import multer from "multer";
import { adminAuth } from "../../middlewares/adminAuth.middleware.js";
import {
  adminListBwBondKyc,
  adminGetBwBondKyc,
  adminUpdateBwBondKycStatus,
  adminAddBwBondKyc,
  adminUploadBwBondDocument,
  adminDeleteBwBondKyc,
} from "../../controllers/bonds/bwBondKycAdmin.controller.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// List all (filter by ?status=SUBMITTED|APPROVED|REJECTED)
router.get("/", adminAuth, adminListBwBondKyc);

// Get one user's KYC details
router.get("/:uniqueId", adminAuth, adminGetBwBondKyc);

// Admin uploads a document (PAN/address/bank/demat proof) on behalf of a user
router.post("/:uniqueId/upload", adminAuth, upload.single("file"), adminUploadBwBondDocument);

// Admin manually submits KYC on behalf of a user
router.post("/:uniqueId", adminAuth, adminAddBwBondKyc);

// Approve or reject
router.put("/:uniqueId/status", adminAuth, adminUpdateBwBondKycStatus);

// Hard delete + reset user status
router.delete("/:uniqueId", adminAuth, adminDeleteBwBondKyc);

export default router;
