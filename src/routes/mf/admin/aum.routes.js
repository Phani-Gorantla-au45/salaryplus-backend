import express from "express";
import { adminAuth } from "../../../middlewares/adminAuth.middleware.js";
import { getAumSummaryAdmin } from "../../../controllers/mf/admin/aum.controller.js";

const router = express.Router();

router.get("/", adminAuth, getAumSummaryAdmin);

export default router;
