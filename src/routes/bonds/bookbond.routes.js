import express from "express";
import { bookBond } from "../../controllers/bonds/bookBond.controller.js";
import { auth } from "../../middlewares/jwt.js";

const router = express.Router();

router.post("/bookbond", auth, bookBond);

export default router;
