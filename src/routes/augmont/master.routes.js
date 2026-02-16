import express from "express";
import { auth } from "../../middlewares/jwt.js";
import {
  syncStates,
  getStatesFromDB,
  syncCities, // ✅ ADDED
  getCitiesFromDB, // ✅ ADDED
} from "../../controllers/augmont/master.controller.js";
import { getRates } from "../../controllers/augmont/rate.controller.js";

const router = express.Router();

/* ---------- MASTER DATA SYNC (ADMIN USE) ---------- */
router.post("/sync-states", syncStates); // existing
router.post("/sync-cities", syncCities); // ✅ ADDED

/* ---------- MASTER DATA FETCH (FRONTEND) ---------- */
router.get("/states", getStatesFromDB); // existing
router.get("/cities", getCitiesFromDB); // ✅ ADDED

/* ---------- RATES ---------- */
router.get("/merchant/v1/rates", auth, getRates);

export default router;
