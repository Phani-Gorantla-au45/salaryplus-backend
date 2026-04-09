import express from "express";
import { adminAuth } from "../../../middlewares/adminAuth.middleware.js";
import { listInvestorProfiles } from "../../../controllers/mf/admin/investorProfile.controller.js";

const router = express.Router();

router.get("/", adminAuth, listInvestorProfiles);

export default router;
