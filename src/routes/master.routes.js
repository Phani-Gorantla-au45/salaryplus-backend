import express from "express";
import { auth } from "../middlewares/jwt.js";
import {
  syncStates,
  getStatesFromDB,
} from "../controllers/augmont/master.controller.js";
import { getRates } from "../controllers/augmont/rate.controller.js";

const router = express.Router();

router.post("/sync-states", syncStates); // admin call
router.get("/states", getStatesFromDB); // frontend dropdown
router.get("/merchant/v1/rates", auth, getRates);
export default router;
