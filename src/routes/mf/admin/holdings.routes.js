import express from "express";
import { adminAuth } from "../../../middlewares/adminAuth.middleware.js";
import { getHoldingsAdmin } from "../../../controllers/mf/admin/holdings.controller.js";

const router = express.Router();

router.get("/:uniqueId", adminAuth, getHoldingsAdmin);

export default router;
