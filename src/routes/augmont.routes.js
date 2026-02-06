// routes/augmont.routes.js
import express from "express";
import { buyMetal, sellMetal } from "../controllers/augmont/buy.controller.js";

import { auth } from "../middlewares/jwt.js";

const router = express.Router();

router.post("/merchant/v1/buy", auth, buyMetal);
router.post("/sell", auth, sellMetal);

export default router;
