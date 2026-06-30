import cron from "node-cron";
import MfUserData from "../../../models/mf/mfUserData.model.js";
import PortfolioReview from "../../../models/mf/review/portfolioReview.model.js";

const REVIEW_CYCLE_MONTHS = 6;

export const addReviewCycleMonths = (date) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + REVIEW_CYCLE_MONTHS);
  return d;
};

/**
 * Creates the next review cycle for a client — called both by the daily
 * auto-enroll job (cycle 1) and by adminCompleteReview (cycle N+1, right
 * after the previous one is marked COMPLETED).
 */
export const scheduleNextReview = async (uniqueId, { cycleNumber, anchorDate }) => {
  const scheduledDate = addReviewCycleMonths(anchorDate);
  return PortfolioReview.create({
    uniqueId,
    cycleNumber,
    scheduledDate,
    defaultDate: scheduledDate,
    status: "SCHEDULED",
  });
};

/**
 * Finds clients past their account-activation anchor with no review record
 * yet at all, and creates their first review cycle.
 */
const autoEnrollNewClients = async () => {
  const enrolled = await PortfolioReview.distinct("uniqueId");

  const candidates = await MfUserData.find(
    {
      "journey.canInvest": true,
      "journey.account.completedAt": { $ne: null },
      uniqueId: { $nin: enrolled },
    },
    { uniqueId: 1, "journey.account.completedAt": 1 },
  ).lean();

  for (const c of candidates) {
    await scheduleNextReview(c.uniqueId, {
      cycleNumber: 1,
      anchorDate: c.journey.account.completedAt,
    });
  }

  if (candidates.length > 0) {
    console.log(`✅ [Portfolio Review] Auto-enrolled ${candidates.length} client(s) into review cycle`);
  }
  return candidates.length;
};

/** Flags any SCHEDULED review whose date has passed as OVERDUE. */
const flagOverdueReviews = async () => {
  const result = await PortfolioReview.updateMany(
    { status: "SCHEDULED", scheduledDate: { $lt: new Date() } },
    { $set: { status: "OVERDUE" } },
  );
  if (result.modifiedCount > 0) {
    console.log(`⚠️ [Portfolio Review] Flagged ${result.modifiedCount} review(s) as OVERDUE`);
  }
  return result.modifiedCount;
};

export const runPortfolioReviewMaintenance = async () => {
  try {
    await autoEnrollNewClients();
    await flagOverdueReviews();
  } catch (err) {
    console.error("❌ [Portfolio Review] Maintenance job failed:", err.message);
  }
};

// Daily at 2 AM — auto-enroll new clients + flag overdue reviews
cron.schedule("0 2 * * *", runPortfolioReviewMaintenance);
