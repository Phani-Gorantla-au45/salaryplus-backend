import express from "express";
import { getBondDetailsController } from "../../controllers/bonds/bondDetails.controller.js";
import { auth } from "../../middlewares/jwt.js";
import { getBondHoldingProfile } from "../../controllers/bonds/bondHoldingProfile.controller.js";

const router = express.Router();

router.post("/user/bonddetails", auth, getBondDetailsController);
router.post("/profile/holding", auth, getBondHoldingProfile);

export default router;
