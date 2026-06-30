import PortfolioReview from "../../../models/mf/review/portfolioReview.model.js";

/* ================================================================
 * GET /api/mf/reviews/next
 * The investor's next upcoming (or overdue) review.
 * ================================================================ */
export const getNextReview = async (req, res) => {
  try {
    const { uniqueId } = req.user;

    const review = await PortfolioReview.findOne({
      uniqueId,
      status: { $in: ["SCHEDULED", "OVERDUE"] },
    })
      .sort({ scheduledDate: 1 })
      .lean();

    if (!review) {
      return res.status(200).json({ success: true, data: null, message: "No upcoming review scheduled" });
    }

    return res.status(200).json({
      success: true,
      data: {
        cycleNumber: review.cycleNumber,
        scheduledDate: review.scheduledDate,
        status: review.status,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ================================================================
 * GET /api/mf/reviews
 * Full review history (past + upcoming) for the logged-in investor.
 * ================================================================ */
export const listMyReviews = async (req, res) => {
  try {
    const { uniqueId } = req.user;

    const reviews = await PortfolioReview.find({ uniqueId }).sort({ scheduledDate: -1 }).lean();

    return res.status(200).json({
      success: true,
      count: reviews.length,
      data: reviews.map((r) => ({
        cycleNumber: r.cycleNumber,
        scheduledDate: r.scheduledDate,
        status: r.status,
        completedAt: r.completedAt,
        keyPoints: r.keyPoints,
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
