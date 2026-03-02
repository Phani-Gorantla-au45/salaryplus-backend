import express from "express";
import {
  syncProducts,
  getProductBySku,
} from "../../controllers/gold/product.controller.js";
import { auth } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/sync", auth, syncProducts);
router.get("/:sku", auth, getProductBySku);

export default router;
