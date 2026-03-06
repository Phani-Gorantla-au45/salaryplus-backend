import express from "express";
import {
  listCuratedBaskets,
  getCuratedBasket,
} from "../../controllers/mf/curatedBasket.controller.js";

const router = express.Router();

// GET /api/mf/curated-basket          — list all active baskets (optional ?riskProfile=)
router.get("/", listCuratedBaskets);

// GET /api/mf/curated-basket/:id      — single basket by id
router.get("/:id", getCuratedBasket);

export default router;
