import express from "express";
import { adminAuth } from "../../../../middlewares/adminAuth.middleware.js";
import {
  adminListReviews,
  adminGetClientReviews,
  adminRescheduleReview,
  adminCompleteReview,
  adminRunMaintenance,
} from "../../../../controllers/mf/admin/review/portfolioReviewAdmin.controller.js";

const router = express.Router();

router.get("/",                      adminAuth, adminListReviews);
router.post("/run-maintenance",      adminAuth, adminRunMaintenance);
router.get("/:uniqueId",             adminAuth, adminGetClientReviews);
router.patch("/:reviewId/reschedule", adminAuth, adminRescheduleReview);
router.patch("/:reviewId/complete",   adminAuth, adminCompleteReview);

export default router;
