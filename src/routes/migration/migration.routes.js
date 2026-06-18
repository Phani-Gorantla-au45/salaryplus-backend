import express from "express";
import multer from "multer";
import { adminAuth } from "../../middlewares/adminAuth.middleware.js";
import {
  uploadMigrationFile,
  listBatches,
  getBatch,
  listRecords,
  getRecord,
  retryRecord,
  retryFailedInBatch,
} from "../../controllers/migration/migration.controller.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Upload a Client Master Report Excel — kicks off background migration
router.post("/upload", adminAuth, upload.single("file"), uploadMigrationFile);

// Batches
router.get("/batches",                       adminAuth, listBatches);
router.get("/batches/:batchId",              adminAuth, getBatch);
router.get("/batches/:batchId/records",      adminAuth, listRecords);
router.post("/batches/:batchId/retry-failed", adminAuth, retryFailedInBatch);

// Individual record
router.get("/records/:recordId",        adminAuth, getRecord);
router.post("/records/:recordId/retry", adminAuth, retryRecord);

export default router;
