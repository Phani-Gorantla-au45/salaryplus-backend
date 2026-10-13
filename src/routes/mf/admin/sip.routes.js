import express from "express";
import { adminAuth } from "../../../middlewares/adminAuth.middleware.js";
import { listSipsAdmin, getSipAdmin, cancelSipAdmin } from "../../../controllers/mf/admin/sip.controller.js";
import {
  adminCreateSkipInstruction,
  adminListSkipInstructions,
  adminCancelSkipInstruction,
} from "../../../controllers/mf/sip/skipInstruction.controller.js";

const router = express.Router();

router.get("/",                           adminAuth, listSipsAdmin);
router.post("/skip/:skipId/cancel",       adminAuth, adminCancelSkipInstruction); // before /:fpSipId
router.get("/:fpSipId",                   adminAuth, getSipAdmin);
router.post("/:fpSipId/cancel",           adminAuth, cancelSipAdmin);
router.post("/:fpSipId/skip",             adminAuth, adminCreateSkipInstruction);
router.get("/:fpSipId/skip",              adminAuth, adminListSkipInstructions);

export default router;
