import express from "express";
import {
  createBasket,
  listBaskets,
  getBasket,
  updateBasket,
  deleteBasket,
} from "../../../controllers/mf/admin/mfBasket.controller.js";
import { adminAuth } from "../../../middlewares/adminAuth.middleware.js";

const router = express.Router();

// All routes require admin auth
router.post("/",    adminAuth, createBasket);
router.get("/",     adminAuth, listBaskets);
router.get("/:id",  adminAuth, getBasket);
router.patch("/:id", adminAuth, updateBasket);
router.delete("/:id", adminAuth, deleteBasket);

export default router;
