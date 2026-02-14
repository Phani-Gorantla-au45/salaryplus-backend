import express from "express";
import { createBond } from "../controllers/bonds/bond.controller.js";

const router = express.Router();

/* -------- Bond Listing -------- */
router.post("/listing", createBond);

export default router;
