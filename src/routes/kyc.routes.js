import express from "express";
import { auth } from "../middlewares/jwt.js";
import { verifyPan } from "../controllers/augmont/kyc.controller.js";

const router = express.Router();

router.post("/verify-pan", auth, verifyPan);

export default router;
