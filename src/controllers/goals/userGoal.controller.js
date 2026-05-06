import GoalTemplate from "../../models/goals/goalTemplate.model.js";
import UserGoal from "../../models/goals/userGoal.model.js";
import { calculateGoal } from "../../services/goals/calculation.service.js";
import { mapTemplatesWithUserGoals } from "../../services/goals/goalMapping.service.js";

/* ------------------------------------------------------------------ */
/*  POST /api/goals/calculate                                           */
/*  Dry-run: returns targetAmount, monthlySip, duration — nothing saved */
/* ------------------------------------------------------------------ */
export const calculateGoalPreview = async (req, res) => {
  try {
    console.log("body in calc", req.body);
    const { templateId, inputs } = req.body;
    if (!templateId || !inputs)
      return res
        .status(400)
        .json({ message: "templateId and inputs are required" });

    const template = await GoalTemplate.findById(templateId).lean();
    if (!template)
      return res.status(404).json({ message: "Template not found" });

    const result = calculateGoal(template.type, inputs, template.assumptions);
    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  POST /api/goals                                                     */
/*  Save or update a user's goal (upsert by uniqueId + templateType)   */
/* ------------------------------------------------------------------ */
export const saveUserGoal = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { templateId, inputs } = req.body;

    if (!templateId || !inputs)
      return res
        .status(400)
        .json({ message: "templateId and inputs are required" });

    const template = await GoalTemplate.findById(templateId).lean();
    if (!template)
      return res.status(404).json({ message: "Template not found" });

    const result = calculateGoal(template.type, inputs, template.assumptions);

    const goal = await UserGoal.findOneAndUpdate(
      { uniqueId, templateType: template.type },
      {
        $set: {
          templateId,
          inputs,
          targetAmount: result.targetAmount,
          monthlySip:   result.monthlySip,
          stepUpSip:    result.stepUpSip  ?? null,
          stepUpRate:   result.stepUpRate ?? null,
          duration:     result.duration,
          status:       "active",
        },
      },
      { upsert: true, new: true, runValidators: true },
    );

    res.status(201).json({ goal });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/goals                                                      */
/*  Home screen: all templates merged with user's saved goals           */
/* ------------------------------------------------------------------ */
export const listUserGoals = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const goals = await mapTemplatesWithUserGoals(uniqueId);
    res.json({ goals });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to fetch goals", error: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/goals/:id                                                  */
/*  Single user-goal detail (includes inputs + template fields)         */
/* ------------------------------------------------------------------ */
export const getUserGoal = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const goal = await UserGoal.findOne({ _id: req.params.id, uniqueId })
      .populate("templateId")
      .lean();
    if (!goal) return res.status(404).json({ message: "Goal not found" });
    res.json({ goal });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  PATCH /api/goals/:id                                                */
/*  Update inputs → recalculate                                         */
/* ------------------------------------------------------------------ */
export const updateUserGoal = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const goal = await UserGoal.findOne({ _id: req.params.id, uniqueId });
    if (!goal) return res.status(404).json({ message: "Goal not found" });

    const inputs = req.body.inputs ?? goal.inputs;
    const template = await GoalTemplate.findById(goal.templateId).lean();

    const result = calculateGoal(template.type, inputs, template.assumptions);

    Object.assign(goal, {
      inputs,
      targetAmount: result.targetAmount,
      monthlySip:   result.monthlySip,
      stepUpSip:    result.stepUpSip  ?? null,
      stepUpRate:   result.stepUpRate ?? null,
      duration:     result.duration,
      ...(req.body.status && { status: req.body.status }),
      ...(req.body.linkedSipId !== undefined && {
        linkedSipId: req.body.linkedSipId,
      }),
    });

    await goal.save();
    res.json({ goal });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  DELETE /api/goals/:id                                               */
/* ------------------------------------------------------------------ */
export const deleteUserGoal = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const deleted = await UserGoal.findOneAndDelete({
      _id: req.params.id,
      uniqueId,
    });
    if (!deleted) return res.status(404).json({ message: "Goal not found" });
    res.json({ message: "Goal deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
