import express from "express";
import { auth } from "../../middlewares/auth.middleware.js";
import {
  syncStates,
  getStatesFromDB,
  syncCities,
  getCitiesFromDB,
} from "../../controllers/gold/master.controller.js";
import { getRates } from "../../controllers/gold/rate.controller.js";

const router = express.Router();

/* ---------- MASTER DATA SYNC (ADMIN USE) ---------- */
router.post("/sync-states", syncStates);
router.post("/sync-cities", syncCities);

/* ---------- MASTER DATA FETCH (FRONTEND) ---------- */
router.get("/states", getStatesFromDB);
router.get("/cities", getCitiesFromDB);

/* ---------- RATES ---------- */
router.get("/rates", auth, getRates);

export default router;
