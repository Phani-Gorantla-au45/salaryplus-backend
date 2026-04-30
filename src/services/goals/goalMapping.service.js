import GoalTemplate from "../../models/goals/goalTemplate.model.js";
import UserGoal     from "../../models/goals/userGoal.model.js";

/**
 * Returns all active templates merged with the user's saved goals.
 * Used for the home screen "Goals" section.
 *
 * @param {string} uniqueId
 * @returns {Array<{ templateId, name, type, description, icon, displayOrder,
 *                   isSetup, targetAmount, monthlySip, duration, status,
 *                   linkedSipId, userGoalId }>}
 */
export async function mapTemplatesWithUserGoals(uniqueId) {
  const [templates, userGoals] = await Promise.all([
    GoalTemplate.find({ isActive: true }).sort({ displayOrder: 1 }).lean(),
    UserGoal.find({ uniqueId }).lean(),
  ]);

  const goalByType = {};
  for (const ug of userGoals) goalByType[ug.templateType] = ug;

  return templates.map((t) => {
    const ug = goalByType[t.type];
    return {
      templateId:   t._id,
      name:         t.name,
      type:         t.type,
      description:  t.description,
      icon:         t.icon,
      displayOrder: t.displayOrder,
      isSetup:      !!ug,
      // computed fields — null if not yet set up
      userGoalId:   ug?._id     ?? null,
      targetAmount: ug?.targetAmount ?? null,
      monthlySip:   ug?.monthlySip   ?? null,
      duration:     ug?.duration     ?? null,
      status:       ug?.status       ?? null,
      linkedSipId:  ug?.linkedSipId  ?? null,
    };
  });
}
