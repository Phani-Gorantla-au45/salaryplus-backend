import express from "express";
import { getBondDetailsController } from "../../controllers/bonds/bondDetails.controller.js";
import { auth } from "../../middlewares/jwt.js";

const router = express.Router();

router.post("/user/bonddetails", auth, getBondDetailsController);
export default router;
