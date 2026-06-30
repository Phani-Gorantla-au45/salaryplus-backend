import express from "express";
import { auth } from "../../../middlewares/auth.middleware.js";
import { getNextReview, listMyReviews } from "../../../controllers/mf/review/portfolioReview.controller.js";

const router = express.Router();

router.get("/next", auth, getNextReview);
router.get("/",     auth, listMyReviews);

export default router;
