import express from "express";
import { syncStates, getStatesFromDB } from "./master.controller.js";

const router = express.Router();

router.post("/sync-states", syncStates); // admin call
router.get("/states", getStatesFromDB); // frontend dropdown

export default router;
