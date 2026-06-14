import express from "express";
import { auth } from "../../middlewares/auth.middleware.js";
import { getBwBondPortfolio } from "../../controllers/bonds/bwBondPortfolio.controller.js";

const router = express.Router();

router.get("/portfolio", auth, getBwBondPortfolio);

export default router;
