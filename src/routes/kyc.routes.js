import express from "express";
import { auth } from "../middlewares/jwt.js";
import {
  verifyPan,
  verifyfullPan,
} from "../controllers/augmont/kyc.controller.js";

const router = express.Router();

router.post("/verify-pan", auth, verifyPan);

router.post("/verifyfullpan", auth, verifyfullPan);

export default router;
