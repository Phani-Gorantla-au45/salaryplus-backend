import express from "express";
import { getUserRedemptionReport } from "../../../controllers/mf/admin/listReports.controller.js";
import { auth } from "../../../middlewares/auth.middleware.js";

const router = express.Router();

// GET /api/mf/reports/redemptions          — authenticated user's own FP redemptions
// Optional: ?states=successful,submitted&since=2024-10-01
router.get("/", auth, getUserRedemptionReport);

export default router;
