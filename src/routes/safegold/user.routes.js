import express from "express";
import { auth } from "../../middlewares/auth.middleware.js";
import {
  registerSafegoldUser,
  getSafegoldProfile,
} from "../../controllers/safegold/user.controller.js";

const router = express.Router();

router.post("/register", auth, registerSafegoldUser);
router.get( "/profile",  auth, getSafegoldProfile);

export default router;
