import GoalTemplate from "../../models/goals/goalTemplate.model.js";

/* GET /api/goals/templates */
export const listTemplates = async (req, res) => {
  try {
    const templates = await GoalTemplate.find({ isActive: true })
      .sort({ displayOrder: 1 })
      .lean();
    res.json({ templates });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch goal templates", error: err.message });
  }
};

/* GET /api/goals/templates/:id */
export const getTemplate = async (req, res) => {
  try {
    const template = await GoalTemplate.findById(req.params.id).lean();
    if (!template) return res.status(404).json({ message: "Template not found" });
    res.json({ template });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch template", error: err.message });
  }
};

/* -------- Admin CRUD -------- */

/* POST /api/admin/goals/templates */
export const createTemplate = async (req, res) => {
  try {
    const template = await GoalTemplate.create(req.body);
    res.status(201).json({ template });
  } catch (err) {
    const status = err.code === 11000 ? 409 : 400;
    res.status(status).json({ message: err.message });
  }
};

/* PATCH /api/admin/goals/templates/:id */
export const updateTemplate = async (req, res) => {
  try {
    const template = await GoalTemplate.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!template) return res.status(404).json({ message: "Template not found" });
    res.json({ template });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

/* DELETE /api/admin/goals/templates/:id  (soft delete) */
export const deactivateTemplate = async (req, res) => {
  try {
    const template = await GoalTemplate.findByIdAndUpdate(
      req.params.id,
      { $set: { isActive: false } },
      { new: true }
    );
    if (!template) return res.status(404).json({ message: "Template not found" });
    res.json({ message: "Template deactivated", template });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
