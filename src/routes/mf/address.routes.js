import express from "express";
import { createAddress, getAddress } from "../../controllers/mf/address.controller.js";
import { auth } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// POST /api/mf/address  — add address to investor profile
router.post("/", auth, createAddress);

// GET  /api/mf/address  — fetch stored address
router.get("/",  auth, getAddress);

export default router;
