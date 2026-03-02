// routes/augmont.routes.js
import express from "express";
import { buyMetal } from "../../controllers/gold/buy.controller.js";
import { sellMetal } from "../../controllers/gold/sell.controller.js";
import { auth } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/merchant/v1/buy", auth, buyMetal);
router.post("/sell", auth, sellMetal);

export default router;
