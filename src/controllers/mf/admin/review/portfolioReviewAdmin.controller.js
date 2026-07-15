import PortfolioReview from "../../../../models/mf/review/portfolioReview.model.js";
import RegistrationUser from "../../../../models/user/user.model.js";
import { scheduleNextReview, runPortfolioReviewMaintenance } from "../../../../utils/mf/review/reviewScheduler.utils.js";
import { sendPortfolioReviewEmail } from "../../../../utils/notifications/email.utils.js";

/* ================================================================
 * GET /api/mf/admin/reviews?status=OVERDUE&dueWithinDays=14
 * Advisor's worklist — across all clients.
 * ================================================================ */
export const adminListReviews = async (req, res) => {
  try {
    const { status, dueWithinDays } = req.query;

    const filter = {};
    if (status) filter.status = status.toUpperCase();
    if (dueWithinDays) {
      const until = new Date();
      until.setDate(until.getDate() + Number(dueWithinDays));
      filter.scheduledDate = { ...(filter.scheduledDate || {}), $lte: until };
      filter.status = filter.status ?? { $in: ["SCHEDULED", "OVERDUE"] };
    }

    const reviews = await PortfolioReview.find(filter).sort({ scheduledDate: 1 }).lean();

    const uniqueIds = [...new Set(reviews.map((r) => r.uniqueId))];
    const users = await RegistrationUser.find(
      { uniqueId: { $in: uniqueIds } },
      { uniqueId: 1, First_name: 1, Last_name: 1, email: 1, phone: 1 },
    ).lean();
    const userMap = Object.fromEntries(users.map((u) => [u.uniqueId, u]));

    return res.status(200).json({
      success: true,
      count: reviews.length,
      data: reviews.map((r) => ({
        _id: r._id,
        uniqueId: r.uniqueId,
        investorName: [userMap[r.uniqueId]?.First_name, userMap[r.uniqueId]?.Last_name].filter(Boolean).join(" ") || null,
        email: userMap[r.uniqueId]?.email ?? null,
        phone: userMap[r.uniqueId]?.phone ?? null,
        cycleNumber: r.cycleNumber,
        scheduledDate: r.scheduledDate,
        status: r.status,
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ================================================================
 * GET /api/mf/admin/reviews/:uniqueId
 * Full review history for one client.
 * ================================================================ */
export const adminGetClientReviews = async (req, res) => {
  try {
    const { uniqueId } = req.params;

    const reviews = await PortfolioReview.find({ uniqueId }).sort({ scheduledDate: -1 }).lean();
    if (reviews.length === 0) {
      return res.status(404).json({ success: false, message: "No review records for this client" });
    }

    return res.status(200).json({ success: true, count: reviews.length, data: reviews });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ================================================================
 * PATCH /api/mf/admin/reviews/:reviewId/reschedule
 * Body: { scheduledDate }
 * ================================================================ */
export const adminRescheduleReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { scheduledDate } = req.body;

    if (!scheduledDate || isNaN(new Date(scheduledDate).getTime())) {
      return res.status(400).json({ success: false, message: "Valid scheduledDate is required" });
    }

    const review = await PortfolioReview.findById(reviewId);
    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }
    if (review.status === "COMPLETED") {
      return res.status(400).json({ success: false, message: "Cannot reschedule a completed review" });
    }

    review.rescheduledFrom = review.scheduledDate;
    review.rescheduledBy = req.admin?.uniqueId ?? null;
    review.rescheduledAt = new Date();
    review.scheduledDate = new Date(scheduledDate);
    review.status = new Date(scheduledDate) < new Date() ? "OVERDUE" : "SCHEDULED";
    await review.save();

    return res.status(200).json({ success: true, message: "Review rescheduled", data: review });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ================================================================
 * PATCH /api/mf/admin/reviews/:reviewId/complete
 * Body: { keyPoints: string[] }
 * Marks this cycle COMPLETED and auto-creates the next cycle 6 months out.
 * ================================================================ */
export const adminCompleteReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { keyPoints } = req.body;

    if (!Array.isArray(keyPoints) || keyPoints.length === 0) {
      return res.status(400).json({ success: false, message: "keyPoints (non-empty array) is required" });
    }

    const review = await PortfolioReview.findById(reviewId);
    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }
    if (review.status === "COMPLETED") {
      return res.status(400).json({ success: false, message: "Review already completed" });
    }

    const completedAt = new Date();
    review.status = "COMPLETED";
    review.completedAt = completedAt;
    review.completedBy = req.admin?.uniqueId ?? null;
    review.keyPoints = keyPoints;
    await review.save();

    const next = await scheduleNextReview(review.uniqueId, {
      cycleNumber: review.cycleNumber + 1,
      anchorDate: completedAt,
    });

    // Send review notes email to user — non-fatal
    const user = await RegistrationUser.findOne(
      { uniqueId: review.uniqueId },
      { email: 1, First_name: 1, Last_name: 1 }
    ).lean();

    if (user?.email) {
      const userName = [user.First_name, user.Last_name].filter(Boolean).join(" ");
      sendPortfolioReviewEmail({
        to:         user.email,
        userName,
        keyPoints,
        reviewDate: completedAt,
      }).catch((err) => console.error("❌ [REVIEW EMAIL] Failed (non-fatal):", err.message));
    }

    return res.status(200).json({
      success: true,
      message: "Review completed",
      data: review,
      nextReview: { scheduledDate: next.scheduledDate, cycleNumber: next.cycleNumber },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ================================================================
 * POST /api/mf/admin/reviews/run-maintenance
 * Manually trigger the daily auto-enroll + overdue-flagging job
 * (otherwise runs automatically at 2 AM) — useful right after launch.
 * ================================================================ */
export const adminRunMaintenance = async (req, res) => {
  try {
    await runPortfolioReviewMaintenance();
    return res.status(200).json({ success: true, message: "Maintenance job completed" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
