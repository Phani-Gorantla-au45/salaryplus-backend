import express from "express";
import {
  listCuratedBaskets,
  getCuratedBasket,
} from "../../controllers/mf/curatedBasket.controller.js";
import { auth } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// GET /api/mf/curated-basket          — list baskets (user-specific override if exists, else default)
router.get("/", auth, listCuratedBaskets);

// GET /api/mf/curated-basket/:id      — single basket by id
router.get("/:id", getCuratedBasket);

export default router;
