import express from "express";
import {
  getInvestmentReturns,
  getSchemeReturns,
} from "../../../controllers/mf/reports/returns.controller.js";
import { auth } from "../../../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/",        auth, getInvestmentReturns);
router.get("/schemes", auth, getSchemeReturns);

export default router;
