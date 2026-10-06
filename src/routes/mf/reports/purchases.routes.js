import express from "express";
import { getUserPurchaseReport } from "../../../controllers/mf/admin/listReports.controller.js";
import { auth } from "../../../middlewares/auth.middleware.js";

const router = express.Router();

// GET /api/mf/reports/purchases          — authenticated user's own FP purchases
// Optional: ?states=successful,submitted
router.get("/", auth, getUserPurchaseReport);

export default router;
