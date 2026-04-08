import express from "express";
import { adminAuth } from "../../../middlewares/adminAuth.middleware.js";
import { listSipsAdmin, getSipAdmin } from "../../../controllers/mf/admin/sip.controller.js";

const router = express.Router();

router.get("/",          adminAuth, listSipsAdmin); // GET /api/mf/admin/sip
router.get("/:fpSipId",  adminAuth, getSipAdmin);   // GET /api/mf/admin/sip/:fpSipId

export default router;
