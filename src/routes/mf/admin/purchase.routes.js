import express from "express";
import { adminAuth } from "../../../middlewares/adminAuth.middleware.js";
import { getPurchaseAdmin } from "../../../controllers/mf/admin/purchase.controller.js";

const router = express.Router();

router.get("/:id", adminAuth, getPurchaseAdmin);

export default router;
