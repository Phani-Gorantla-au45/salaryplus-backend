import MfSip from "../../../models/mf/sip/mfSip.model.js";
import {
  fetchFpSip,
  createFpSkipInstruction,
  listFpSkipInstructions,
  cancelFpSkipInstruction,
} from "../../../utils/mf/sip/sip.utils.js";

const MAX_SKIP_COUNT = 2;

/* ------------------------------------------------------------------ */
/*  Shared — build and send a skip instruction given a resolved FP     */
/*  plan id and skip_count. Used by both user and admin flows.         */
/* ------------------------------------------------------------------ */
const buildAndCreateSkip = async (fpSipId, skip_count) => {
  const count = Number(skip_count);
  if (!count || count < 1 || count > MAX_SKIP_COUNT) {
    const err = new Error(`skip_count must be 1 or 2`);
    err.statusCode = 400;
    throw err;
  }

  const plan = await fetchFpSip(fpSipId);
  if (!plan?.next_installment_date) {
    const err = new Error("Cannot determine next installment date — plan may not be active");
    err.statusCode = 400;
    throw err;
  }

  const from = plan.next_installment_date;
  const to   = nthInstallmentDate(plan.next_installment_date, plan.frequency, count);

  return createFpSkipInstruction(fpSipId, { from, to });
};

/* ------------------------------------------------------------------ */
/*  Internal — given a plan's next_installment_date and frequency,     */
/*  return the date of the Nth next installment (1-indexed).           */
/* ------------------------------------------------------------------ */
const nthInstallmentDate = (nextDateStr, frequency, n) => {
  const date = new Date(nextDateStr);
  for (let i = 1; i < n; i++) {
    if (frequency === "monthly")     date.setMonth(date.getMonth() + 1);
    else if (frequency === "weekly") date.setDate(date.getDate() + 7);
    else if (frequency === "daily")  date.setDate(date.getDate() + 1);
    else                             date.setMonth(date.getMonth() + 1); // fallback
  }
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
};

/* ================================================================
 * POST /api/mf/sip/:sipId/skip
 *
 * Creates a skip instruction for the user's SIP plan.
 * Body: { skip_count: 1 | 2 }
 *   skip_count=1 → skip the next 1 installment
 *   skip_count=2 → skip the next 2 installments
 *
 * Dates are auto-calculated from the plan's next_installment_date.
 * ================================================================ */
export const createSkipInstruction = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { sipId } = req.params;
    const { skip_count } = req.body;

    // Verify this SIP belongs to the user (sipId is FP's mfpp_xxx)
    const sipRecord = await MfSip.findOne({ fpSipId: sipId, uniqueId }).lean();
    if (!sipRecord) {
      return res.status(404).json({ success: false, message: "SIP not found" });
    }
    if (!sipRecord.fpSipId) {
      return res.status(400).json({ success: false, message: "SIP has no FP plan ID" });
    }

    console.log(`[SKIP] uniqueId=${uniqueId} plan=${sipRecord.fpSipId} skip_count=${skip_count}`);
    const result = await buildAndCreateSkip(sipRecord.fpSipId, skip_count);

    return res.status(201).json({
      success: true,
      message: `${skip_count} installment(s) will be skipped`,
      data: result,
    });
  } catch (err) {
    console.error("❌ [SKIP] Create error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ================================================================
 * GET /api/mf/sip/:sipId/skip
 *
 * Lists skip instructions for the user's SIP plan.
 * Optional query: ?statuses=pending,active
 * ================================================================ */
export const listSkipInstructions = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { sipId } = req.params;
    const { statuses } = req.query;

    const sipRecord = await MfSip.findOne({ fpSipId: sipId, uniqueId }).lean();
    if (!sipRecord) {
      return res.status(404).json({ success: false, message: "SIP not found" });
    }

    const params = {};
    if (statuses) params.statuses = statuses;

    const result = await listFpSkipInstructions(sipRecord.fpSipId, params);

    return res.status(200).json({
      success: true,
      count: result?.data?.length ?? 0,
      data:  result?.data ?? [],
    });
  } catch (err) {
    console.error("❌ [SKIP] List error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ================================================================
 * POST /api/mf/sip/skip/:skipId/cancel
 *
 * Cancels a pending or active skip instruction.
 * User must own the SIP the skip belongs to.
 * ================================================================ */
export const cancelSkipInstruction = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { skipId } = req.params;

    // Verify ownership via the plan id in the skip instruction
    // Fetch skip instruction first, then match plan against user's SIPs
    const result = await cancelFpSkipInstruction(skipId);

    // Sanity-check: confirm the cancelled plan belongs to this user
    const planId = result?.plan;
    if (planId) {
      const owns = await MfSip.exists({ fpSipId: planId, uniqueId });
      if (!owns) {
        return res.status(403).json({ success: false, message: "Not authorised to cancel this skip instruction" });
      }
    }

    return res.status(200).json({
      success: true,
      message: "Skip instruction cancelled",
      data: result,
    });
  } catch (err) {
    console.error("❌ [SKIP] Cancel error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ================================================================
 * ADMIN — POST /api/mf/admin/sip/:fpSipId/skip
 * Create a skip instruction on behalf of a user.
 * :fpSipId is FP's plan id (mfpp_xxx) — same as other admin SIP routes.
 * Body: { skip_count: 1 | 2 }
 * ================================================================ */
export const adminCreateSkipInstruction = async (req, res) => {
  try {
    const { fpSipId } = req.params;
    const { skip_count } = req.body;

    console.log(`[ADMIN SKIP] Create plan=${fpSipId} skip_count=${skip_count}`);
    const result = await buildAndCreateSkip(fpSipId, skip_count);

    return res.status(201).json({
      success: true,
      message: `${skip_count} installment(s) will be skipped`,
      data: result,
    });
  } catch (err) {
    const status = err.statusCode ?? 500;
    console.error("❌ [ADMIN SKIP] Create error:", err.message);
    return res.status(status).json({ success: false, message: err.message });
  }
};

/* ================================================================
 * ADMIN — GET /api/mf/admin/sip/:fpSipId/skip
 * List skip instructions for a plan.
 * Optional query: ?statuses=pending,active
 * ================================================================ */
export const adminListSkipInstructions = async (req, res) => {
  try {
    const { fpSipId } = req.params;
    const { statuses } = req.query;

    const params = {};
    if (statuses) params.statuses = statuses;

    const result = await listFpSkipInstructions(fpSipId, params);

    return res.status(200).json({
      success: true,
      count: result?.data?.length ?? 0,
      data:  result?.data ?? [],
    });
  } catch (err) {
    console.error("❌ [ADMIN SKIP] List error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ================================================================
 * ADMIN — POST /api/mf/admin/sip/skip/:skipId/cancel
 * Cancel a skip instruction directly by its FP id.
 * ================================================================ */
export const adminCancelSkipInstruction = async (req, res) => {
  try {
    const { skipId } = req.params;

    console.log(`[ADMIN SKIP] Cancel id=${skipId}`);
    const result = await cancelFpSkipInstruction(skipId);

    return res.status(200).json({
      success: true,
      message: "Skip instruction cancelled",
      data: result,
    });
  } catch (err) {
    console.error("❌ [ADMIN SKIP] Cancel error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
