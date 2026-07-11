import express from "express";
import { adminAuth } from "../../middlewares/adminAuth.middleware.js";
import { getBondMaturityReport } from "../../controllers/bonds/bondMaturityReport.controller.js";

const router = express.Router();

// GET /api/bw/admin/bonds/maturity-report
// Query: ?within_days=30  ?status=maturing_30d
router.get("/", adminAuth, getBondMaturityReport);

export default router;
