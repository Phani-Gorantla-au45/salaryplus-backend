import { Router } from "express";
import { auth } from "../../middlewares/auth.middleware.js";
import {
  listGoalTypes,
  calculateGoalPreview,
  createCustomGoal,
  listCustomGoals,
  getCustomGoal,
  updateCustomGoal,
  deleteCustomGoal,
  linkFundsToGoal,
} from "../../controllers/goals/userCustomGoal.controller.js";

const router = Router();

// Public — no auth needed
router.get  ("/types",      listGoalTypes);
router.post ("/calculate",  calculateGoalPreview);

// Authenticated user routes
router.post  ("/",                auth, createCustomGoal);
router.get   ("/",                auth, listCustomGoals);
router.get   ("/:id",             auth, getCustomGoal);
router.patch ("/:id",             auth, updateCustomGoal);
router.delete("/:id",             auth, deleteCustomGoal);
router.patch ("/:id/link-funds",  auth, linkFundsToGoal);

export default router;
