import express from "express";
import {
  listBasket,
  getSchemeByIsin,
  listFunds,
} from "../../controllers/mf/mfBasket.controller.js";

const router = express.Router();

// GET /api/mf/basket/fund-list   — distinct fund names for filters (MUST be before /:isin)
router.get("/fund-list", listFunds);

// GET /api/mf/basket             — list all active schemes (paginated + filtered)
router.get("/", listBasket);

// GET /api/mf/basket/:isin       — single scheme details
router.get("/:isin", getSchemeByIsin);

export default router;
