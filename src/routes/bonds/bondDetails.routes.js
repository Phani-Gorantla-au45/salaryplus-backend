import express from "express";
import { getBondDetailsController } from "../../controllers/bonds/bondDetails.controller.js";
import { auth } from "../../middlewares/auth.middleware.js";
import { getBondHoldingProfile } from "../../controllers/bonds/bondHolding.controller.js";

const router = express.Router();

router.post("/user/bonddetails", auth, getBondDetailsController);
router.post("/profile/holding", auth, getBondHoldingProfile);

export default router;
