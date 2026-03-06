import express from "express";
import { getHoldings } from "../../../controllers/mf/reports/holdings.controller.js";
import { auth } from "../../../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/", auth, getHoldings);

export default router;
