import express from "express";
import { createGoldAccount } from "../controllers/augmont/gold.controller.js";
import { auth } from "../middlewares/jwt.js";
const router = express.Router();

router.post("/create", auth, createGoldAccount);

export default router;
