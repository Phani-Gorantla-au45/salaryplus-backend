import { Router } from "express";
import { auth }      from "../../middlewares/auth.middleware.js";
import { adminAuth } from "../../middlewares/adminAuth.middleware.js";
import {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deactivateTemplate,
} from "../../controllers/goals/goalTemplate.controller.js";
import {
  calculateGoalPreview,
  saveUserGoal,
  listUserGoals,
  getUserGoal,
  updateUserGoal,
  deleteUserGoal,
} from "../../controllers/goals/userGoal.controller.js";

const router = Router();

// Public / user-facing templates
router.get("/templates",     listTemplates);
router.get("/templates/:id", getTemplate);

// Admin template management
router.post  ("/admin/templates",     adminAuth, createTemplate);
router.patch ("/admin/templates/:id", adminAuth, updateTemplate);
router.delete("/admin/templates/:id", adminAuth, deactivateTemplate);

// Dry-run calculation (no auth needed, but auth allowed)
router.post("/calculate", calculateGoalPreview);

// User goals (authenticated)
router.get   ("/",    auth, listUserGoals);
router.post  ("/",    auth, saveUserGoal);
router.get   ("/:id", auth, getUserGoal);
router.patch ("/:id", auth, updateUserGoal);
router.delete("/:id", auth, deleteUserGoal);

export default router;
