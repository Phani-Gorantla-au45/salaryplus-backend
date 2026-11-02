import express from "express";
import { auth } from "../../../middlewares/auth.middleware.js";
import { getLamfStatus, registerLamfUser } from "../../../controllers/mf/lamf/lamf.controller.js";

const router = express.Router();

// GET  /api/mf/lamf/status   — check if user is already registered with Finsire
// POST /api/mf/lamf/register — register user, get finsire_id + deep-link
router.get( "/status",   auth, getLamfStatus);
router.post("/register", auth, registerLamfUser);

export default router;
