import express from "express";
import {
  createBasket,
  listBaskets,
  getBasket,
  updateBasket,
  deleteBasket,
  assignBasket,
  createFlagshipBasket,
  getFlagshipBasket,
  updateFlagshipBasket,
  deleteFlagshipBasket,
} from "../../../controllers/mf/admin/mfBasket.controller.js";
import { adminAuth } from "../../../middlewares/adminAuth.middleware.js";

const router = express.Router();

// Flagship basket — must be before /:id
router.post  ("/flagship",    adminAuth, createFlagshipBasket);
router.get   ("/flagship",    adminAuth, getFlagshipBasket);
router.patch ("/flagship",    adminAuth, updateFlagshipBasket);
router.delete("/flagship",    adminAuth, deleteFlagshipBasket);

// Regular baskets
router.post("/",              adminAuth, createBasket);
router.get("/",               adminAuth, listBaskets);
router.get("/:id",            adminAuth, getBasket);
router.patch("/:id",          adminAuth, updateBasket);
router.delete("/:id",         adminAuth, deleteBasket);
router.post("/:id/assign",    adminAuth, assignBasket);

export default router;
