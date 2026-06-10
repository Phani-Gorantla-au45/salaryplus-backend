import express from "express";
import { auth } from "../../middlewares/auth.middleware.js";
import {
  registerSafegoldUser,
  getSafegoldProfile,
  getSafegoldBalance,
  syncBalance,
} from "../../controllers/safegold/user.controller.js";

const router = express.Router();

router.post("/register",      auth, registerSafegoldUser);
router.get( "/profile",       auth, getSafegoldProfile);
router.get( "/balance",       auth, getSafegoldBalance);
router.post("/balance/sync",  auth, syncBalance);

export default router;
