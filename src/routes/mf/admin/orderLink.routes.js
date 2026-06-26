import express from "express";
import { adminAuth } from "../../../middlewares/adminAuth.middleware.js";
import {
  createSingleOrderLink,
  createBasketOrderLink,
  listOrderLinks,
  getOrderLink,
  cancelOrderLink,
} from "../../../controllers/mf/admin/orderLink.controller.js";

const router = express.Router();

router.post("/single",        adminAuth, createSingleOrderLink);
router.post("/basket",        adminAuth, createBasketOrderLink);
router.get("/",                adminAuth, listOrderLinks);
router.get("/:id",             adminAuth, getOrderLink);
router.post("/:id/cancel",     adminAuth, cancelOrderLink);

export default router;
