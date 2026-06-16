import UserCustomGoal from "../../models/goals/userCustomGoal.model.js";
import { GOAL_TYPES, getGoalType } from "../../config/goalTypes.config.js";
import { calculateCustomGoal } from "../../services/goals/calculation.service.js";

/* ================================================================
 * GET GOAL TYPES  (no auth — public)
 * GET /api/custom-goals/types
 * Returns all predefined goal types with their field definitions
 * so the frontend can render the form dynamically.
 * ================================================================ */
export const listGoalTypes = async (req, res) => {
  return res.status(200).json({ success: true, data: GOAL_TYPES });
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
    });

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

    return res.status(200).json({ success: true, count: goals.length, data: goals });
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
    return res.status(200).json({ success: true, data: goal });
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
