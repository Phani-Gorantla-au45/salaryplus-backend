import express from "express";
import { submitKyc } from "../../controllers/bonds/SBkyc.controller.js";
import { auth } from "../../middlewares/jwt.js";

const router = express.Router();

router.post("/submit-kyc", auth, submitKyc);

export default router;
