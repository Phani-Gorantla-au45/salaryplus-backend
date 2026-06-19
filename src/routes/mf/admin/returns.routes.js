import express from "express";
import { adminAuth } from "../../../middlewares/adminAuth.middleware.js";
import {
  getInvestmentReturnsAdmin,
  getSchemeReturnsAdmin,
} from "../../../controllers/mf/admin/returns.controller.js";

const router = express.Router();

router.get("/:uniqueId/schemes", adminAuth, getSchemeReturnsAdmin);
router.get("/:uniqueId",         adminAuth, getInvestmentReturnsAdmin);

export default router;
