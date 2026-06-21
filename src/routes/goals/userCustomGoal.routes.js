import { Router } from "express";
import { auth } from "../../middlewares/auth.middleware.js";
import { adminAuth } from "../../middlewares/adminAuth.middleware.js";
import {
  listGoalTypes,
  calculateGoalPreview,
  createCustomGoal,
  listCustomGoals,
  getCustomGoal,
  updateCustomGoal,
  deleteCustomGoal,
  linkFundsToGoal,
  listAllCustomGoalsAdmin,
  getUserCustomGoalsAdmin,
} from "../../controllers/goals/userCustomGoal.controller.js";

const router = Router();

// Public — no auth needed
router.get  ("/types",      listGoalTypes);
router.post ("/calculate",  calculateGoalPreview);

// Admin — must be registered before "/:id" so "admin" isn't swallowed as a goal id
router.get  ("/admin",                adminAuth, listAllCustomGoalsAdmin);
router.get  ("/admin/user/:uniqueId", adminAuth, getUserCustomGoalsAdmin);

// Authenticated user routes
router.post  ("/",                auth, createCustomGoal);
router.get   ("/",                auth, listCustomGoals);
router.get   ("/:id",             auth, getCustomGoal);
router.patch ("/:id",             auth, updateCustomGoal);
router.delete("/:id",             auth, deleteCustomGoal);
router.patch ("/:id/link-funds",  auth, linkFundsToGoal);

export default router;
