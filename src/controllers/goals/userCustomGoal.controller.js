import UserCustomGoal from "../../models/goals/userCustomGoal.model.js";
import RegistrationUser from "../../models/user/user.model.js";
import MfBasket from "../../models/mf/mfBasket.model.js";
import { GOAL_TYPES, GOAL_TYPE_KEYS, getGoalType } from "../../config/goalTypes.config.js";
import { calculateCustomGoal } from "../../services/goals/calculation.service.js";
import { sendGoalSavedEmail, sendGoalSavedToAdmin } from "../../utils/notifications/email.utils.js";

/* ------------------------------------------------------------------ */
/*  Internal — recommended-basket lookup (reuses the existing curated  */
/*  MfBasket system; admin assigns a basket to a goal type by setting  */
/*  MfBasket.goalType to one of the keys in goalTypes.config.js via    */
/*  the existing /api/mf/admin/basket endpoints — no new model needed) */
/* ------------------------------------------------------------------ */
const basketSummary = (b) => ({
  id: b._id,
  name: b.name,
  riskProfile: b.riskProfile,
  fundCount: b.funds?.length ?? 0,
});

const getBasketMapForGoalTypes = async (goalTypes, uniqueId = null) => {
  const filter = uniqueId
    ? { goalType: { $in: goalTypes }, active: true, $or: [{ assignedUserId: uniqueId }, { assignedUserId: null }] }
    : { goalType: { $in: goalTypes }, active: true, assignedUserId: null };

  const baskets = await MfBasket.find(filter, { name: 1, riskProfile: 1, goalType: 1, assignedUserId: 1, funds: 1 }).lean();

  const map = {};
  for (const b of baskets) {
    const isUserOverride = uniqueId && b.assignedUserId === uniqueId;
    if (!map[b.goalType] || isUserOverride) map[b.goalType] = b;
  }
  return map;
};

/* ================================================================
 * GET GOAL TYPES  (no auth — public)
 * GET /api/custom-goals/types
 * Returns all predefined goal types with their field definitions
 * so the frontend can render the form dynamically. Each type includes
 * its recommendedBasket (set by admin via /api/mf/admin/basket), if any.
 * ================================================================ */
export const listGoalTypes = async (req, res) => {
  const basketMap = await getBasketMapForGoalTypes(GOAL_TYPE_KEYS);
  const data = GOAL_TYPES.map((g) => ({
    ...g,
    recommendedBasket: basketMap[g.key] ? basketSummary(basketMap[g.key]) : null,
  }));
  return res.status(200).json({ success: true, data });
};

/* ================================================================
 * CALCULATE (no auth — dry run)
 * POST /api/custom-goals/calculate
 * Body: { goalType, inputs }
 * Returns: { targetAmount, monthlySip, stepUpSip, stepUpRate, duration }
 * Frontend can call this to show live preview before saving.
 * ================================================================ */
export const calculateGoalPreview = async (req, res) => {
  try {
    const { goalType, inputs } = req.body;

    if (!goalType || !inputs) {
      return res.status(400).json({ success: false, message: "goalType and inputs are required" });
    }

    if (!getGoalType(goalType)) {
      return res.status(400).json({ success: false, message: `Unknown goalType: ${goalType}` });
    }

    const result = calculateCustomGoal(goalType, inputs);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

/* ================================================================
 * SAVE GOAL
 * POST /api/custom-goals
 *
 * Body:
 *   goalType     – "retirement" | "kids_education" | "car" | "vacation" | "marriage" | "emergency"
 *   name         – user-defined label
 *   inputs       – raw user inputs (stored for re-display)
 *   targetAmount – calculated by frontend
 *   monthlySip   – calculated by frontend
 *   stepUpSip    – calculated by frontend (optional)
 *   stepUpRate   – % (optional)
 *   chosenPlan   – "sip" | "step_up_sip"
 * ================================================================ */
export const createCustomGoal = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const {
      goalType, name, inputs,
      targetAmount, monthlySip, stepUpSip, stepUpRate,
      chosenPlan,
    } = req.body;

    if (!goalType || !name || !targetAmount || !monthlySip || !chosenPlan) {
      return res.status(400).json({
        success: false,
        message: "goalType, name, targetAmount, monthlySip and chosenPlan are required",
      });
    }

    if (!getGoalType(goalType)) {
      return res.status(400).json({ success: false, message: `Unknown goalType: ${goalType}` });
    }

    if (!["sip", "step_up_sip"].includes(chosenPlan)) {
      return res.status(400).json({ success: false, message: "chosenPlan must be sip or step_up_sip" });
    }

    if (chosenPlan === "step_up_sip" && !stepUpSip) {
      return res.status(400).json({ success: false, message: "stepUpSip is required when chosenPlan is step_up_sip" });
    }

    // Derive targetYear server-side from the goal's own inputs — don't trust
    // the frontend for this, it's used for tracking/sorting/alerts.
    let duration;
    try {
      duration = calculateCustomGoal(goalType, inputs ?? {}).duration;
    } catch (calcErr) {
      return res.status(400).json({ success: false, message: `Could not derive target year: ${calcErr.message}` });
    }
    const targetYear = new Date().getFullYear() + duration;

    const [goal, user] = await Promise.all([
      UserCustomGoal.create({
        uniqueId,
        goalType,
        name: name.trim(),
        inputs:       inputs ?? {},
        targetAmount,
        monthlySip,
        stepUpSip:    stepUpSip  ?? null,
        stepUpRate:   stepUpRate ?? null,
        chosenPlan,
        targetYear,
      }),
      RegistrationUser.findOne({ uniqueId }, { First_name: 1, Last_name: 1, email: 1, phone: 1 }).lean(),
    ]);

    const userName  = [user?.First_name, user?.Last_name].filter(Boolean).join(" ");
    const goalLabel = getGoalType(goalType)?.label ?? goalType;

    const emailPayload = {
      userName,
      goalLabel,
      goalName:    name.trim(),
      targetAmount,
      monthlySip,
      stepUpSip:   stepUpSip  ?? null,
      chosenPlan,
    };

    if (user?.email) {
      sendGoalSavedEmail({ to: user.email, ...emailPayload }).catch((err) =>
        console.error("❌ [Goal] User email failed:", err.message),
      );
    }

    sendGoalSavedToAdmin({
      mobile:      user?.phone,
      email:       user?.email,
      userUniqueId: uniqueId,
      ...emailPayload,
    }).catch((err) =>
      console.error("❌ [Goal] Admin email failed:", err.message),
    );

    return res.status(201).json({ success: true, data: goal });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ================================================================
 * LIST USER'S GOALS
 * GET /api/custom-goals
 * ================================================================ */
export const listCustomGoals = async (req, res) => {
  try {
    const { uniqueId } = req.user;

    const goals = await UserCustomGoal.find({ uniqueId, status: { $ne: "abandoned" } })
      .sort({ createdAt: -1 })
      .lean();

    const goalTypesPresent = [...new Set(goals.map((g) => g.goalType))];
    const basketMap = await getBasketMapForGoalTypes(goalTypesPresent, uniqueId);

    const data = goals.map((g) => ({
      ...g,
      recommendedBasket: basketMap[g.goalType] ? basketSummary(basketMap[g.goalType]) : null,
    }));

    return res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ================================================================
 * GET SINGLE GOAL
 * GET /api/custom-goals/:id
 * ================================================================ */
export const getCustomGoal = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const goal = await UserCustomGoal.findOne({ _id: req.params.id, uniqueId }).lean();
    if (!goal) return res.status(404).json({ success: false, message: "Goal not found" });

    const basketMap = await getBasketMapForGoalTypes([goal.goalType], uniqueId);
    const recommendedBasket = basketMap[goal.goalType] ? basketSummary(basketMap[goal.goalType]) : null;

    // Re-derive the detailed breakdown (years, ages, amortization schedule etc.)
    // from the goal's saved inputs — not persisted, always fresh and consistent.
    let breakdown = null;
    try {
      breakdown = calculateCustomGoal(goal.goalType, goal.inputs ?? {}).breakdown ?? null;
    } catch {
      breakdown = null; // older goals saved before a field was required, etc.
    }

    return res.status(200).json({ success: true, data: { ...goal, recommendedBasket, breakdown } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ================================================================
 * UPDATE GOAL
 * PATCH /api/custom-goals/:id
 * Any field can be updated — recalculates if inputs change
 * ================================================================ */
export const updateCustomGoal = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const goal = await UserCustomGoal.findOne({ _id: req.params.id, uniqueId });
    if (!goal) return res.status(404).json({ success: false, message: "Goal not found" });

    const fields = ["name", "inputs", "targetAmount", "monthlySip", "stepUpSip", "stepUpRate", "chosenPlan", "status"];
    for (const f of fields) {
      if (req.body[f] !== undefined) goal[f] = req.body[f];
    }

    // Inputs changed — recompute targetYear from the updated inputs.
    if (req.body.inputs !== undefined) {
      try {
        const duration = calculateCustomGoal(goal.goalType, goal.inputs).duration;
        goal.targetYear = new Date().getFullYear() + duration;
      } catch (calcErr) {
        return res.status(400).json({ success: false, message: `Could not derive target year: ${calcErr.message}` });
      }
    }

    await goal.save();
    return res.status(200).json({ success: true, data: goal });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ================================================================
 * DELETE GOAL
 * DELETE /api/custom-goals/:id
 * ================================================================ */
export const deleteCustomGoal = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const deleted = await UserCustomGoal.findOneAndDelete({ _id: req.params.id, uniqueId });
    if (!deleted) return res.status(404).json({ success: false, message: "Goal not found" });
    return res.status(200).json({ success: true, message: "Goal deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ================================================================
 * LINK FUNDS TO GOAL
 * PATCH /api/custom-goals/:id/link-funds
 * Body: { linkedFolioNumbers?: [], linkedSipId?: string }
 * ================================================================ */
export const linkFundsToGoal = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const goal = await UserCustomGoal.findOne({ _id: req.params.id, uniqueId });
    if (!goal) return res.status(404).json({ success: false, message: "Goal not found" });

    const { linkedFolioNumbers, linkedSipId } = req.body;
    if (Array.isArray(linkedFolioNumbers)) goal.linkedFolioNumbers = linkedFolioNumbers;
    if (linkedSipId !== undefined)         goal.linkedSipId        = linkedSipId;

    await goal.save();
    return res.status(200).json({ success: true, data: goal });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ================================================================
 * ADMIN — CREATE GOAL ON BEHALF OF A USER
 * POST /api/custom-goals/admin/user/:uniqueId
 * Same logic as createCustomGoal but admin supplies the uniqueId.
 * No user-facing email is sent (admin-initiated flow).
 * ================================================================ */
export const adminCreateGoalForUser = async (req, res) => {
  try {
    const { uniqueId } = req.params;
    const {
      goalType, name, inputs,
      targetAmount, monthlySip, stepUpSip, stepUpRate,
      chosenPlan,
    } = req.body;

    if (!goalType || !name || !targetAmount || !monthlySip || !chosenPlan) {
      return res.status(400).json({
        success: false,
        message: "goalType, name, targetAmount, monthlySip and chosenPlan are required",
      });
    }

    if (!getGoalType(goalType)) {
      return res.status(400).json({ success: false, message: `Unknown goalType: ${goalType}` });
    }

    if (!["sip", "step_up_sip"].includes(chosenPlan)) {
      return res.status(400).json({ success: false, message: "chosenPlan must be sip or step_up_sip" });
    }

    if (chosenPlan === "step_up_sip" && !stepUpSip) {
      return res.status(400).json({ success: false, message: "stepUpSip is required when chosenPlan is step_up_sip" });
    }

    const user = await RegistrationUser.findOne({ uniqueId }, { First_name: 1, Last_name: 1 }).lean();
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    let duration;
    try {
      duration = calculateCustomGoal(goalType, inputs ?? {}).duration;
    } catch (calcErr) {
      return res.status(400).json({ success: false, message: `Could not derive target year: ${calcErr.message}` });
    }
    const targetYear = new Date().getFullYear() + duration;

    const goal = await UserCustomGoal.create({
      uniqueId,
      goalType,
      name: name.trim(),
      inputs:       inputs ?? {},
      targetAmount,
      monthlySip,
      stepUpSip:    stepUpSip  ?? null,
      stepUpRate:   stepUpRate ?? null,
      chosenPlan,
      targetYear,
    });

    return res.status(201).json({ success: true, data: goal });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ================================================================
 * ADMIN — UPDATE ANY USER'S GOAL
 * PATCH /api/custom-goals/admin/:id
 * No ownership check — admin can update any goal.
 * ================================================================ */
export const adminUpdateGoal = async (req, res) => {
  try {
    const goal = await UserCustomGoal.findById(req.params.id);
    if (!goal) return res.status(404).json({ success: false, message: "Goal not found" });

    const fields = ["name", "inputs", "targetAmount", "monthlySip", "stepUpSip", "stepUpRate", "chosenPlan", "status"];
    for (const f of fields) {
      if (req.body[f] !== undefined) goal[f] = req.body[f];
    }

    if (req.body.inputs !== undefined) {
      try {
        const duration = calculateCustomGoal(goal.goalType, goal.inputs).duration;
        goal.targetYear = new Date().getFullYear() + duration;
      } catch (calcErr) {
        return res.status(400).json({ success: false, message: `Could not derive target year: ${calcErr.message}` });
      }
    }

    await goal.save();
    return res.status(200).json({ success: true, data: goal });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ================================================================
 * ADMIN — DELETE ANY USER'S GOAL
 * DELETE /api/custom-goals/admin/:id
 * ================================================================ */
export const adminDeleteGoal = async (req, res) => {
  try {
    const deleted = await UserCustomGoal.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: "Goal not found" });
    return res.status(200).json({ success: true, message: "Goal deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ================================================================
 * ADMIN — LIST ALL USERS' CUSTOM GOALS
 * GET /api/custom-goals/admin
 *
 * Query params (all optional):
 *   goalType — filter by goal type (e.g. "retirement")
 *   status   — filter by status (active/completed/paused/abandoned)
 *   search   — matches goal name, user name, or phone
 *   page, limit
 * ================================================================ */
export const listAllCustomGoalsAdmin = async (req, res) => {
  try {
    const { goalType, status, search, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (goalType) filter.goalType = goalType;
    if (status)   filter.status   = status;

    const goals = await UserCustomGoal.find(filter).sort({ createdAt: -1 }).lean();

    const uniqueIds = [...new Set(goals.map((g) => g.uniqueId))];
    const users = await RegistrationUser.find(
      { uniqueId: { $in: uniqueIds } },
      { uniqueId: 1, First_name: 1, Last_name: 1, phone: 1, email: 1 },
    ).lean();
    const userMap = Object.fromEntries(users.map((u) => [u.uniqueId, u]));

    let enriched = goals.map((g) => {
      const u = userMap[g.uniqueId];
      return {
        ...g,
        user: u
          ? {
              uniqueId: u.uniqueId,
              name: [u.First_name, u.Last_name].filter(Boolean).join(" ") || null,
              phone: u.phone ?? null,
              email: u.email ?? null,
            }
          : null,
      };
    });

    if (search) {
      const regex = new RegExp(search, "i");
      enriched = enriched.filter(
        (g) => regex.test(g.name) || regex.test(g.user?.name ?? "") || regex.test(g.user?.phone ?? ""),
      );
    }

    const pageNum  = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));
    const skip     = (pageNum - 1) * limitNum;
    const total    = enriched.length;
    const paged    = enriched.slice(skip, skip + limitNum);

    return res.status(200).json({
      success: true,
      total,
      page:  pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
      data:  paged,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ================================================================
 * ADMIN — ONE USER'S CUSTOM GOALS
 * GET /api/custom-goals/admin/user/:uniqueId
 * Includes recommendedBasket per goal so admin can see at a glance
 * whether a basket is already assigned for that goal type.
 * ================================================================ */
export const getUserCustomGoalsAdmin = async (req, res) => {
  try {
    const { uniqueId } = req.params;

    const [user, goals] = await Promise.all([
      RegistrationUser.findOne({ uniqueId }, { First_name: 1, Last_name: 1, phone: 1, email: 1 }).lean(),
      UserCustomGoal.find({ uniqueId }).sort({ createdAt: -1 }).lean(),
    ]);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const goalTypesPresent = [...new Set(goals.map((g) => g.goalType))];
    const basketMap = await getBasketMapForGoalTypes(goalTypesPresent, uniqueId);

    const data = goals.map((g) => ({
      ...g,
      recommendedBasket: basketMap[g.goalType] ? basketSummary(basketMap[g.goalType]) : null,
    }));

    return res.status(200).json({
      success: true,
      user: {
        uniqueId,
        name:  [user.First_name, user.Last_name].filter(Boolean).join(" ") || null,
        phone: user.phone ?? null,
        email: user.email ?? null,
      },
      count: data.length,
      data,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
