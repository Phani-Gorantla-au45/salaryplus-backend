import express from "express";
import { adminAuth } from "../../middlewares/adminAuth.middleware.js";
import { getAllBwUsers, getBwUser } from "../../controllers/admin/bwUsers.controller.js";

const router = express.Router();

router.get("/", adminAuth, getAllBwUsers);
router.get("/:uniqueId", adminAuth, getBwUser);

export default router;
