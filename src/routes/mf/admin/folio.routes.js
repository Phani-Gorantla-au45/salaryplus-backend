import express from "express";
import { listFolios, foliosByPan } from "../../../controllers/mf/admin/folio.controller.js";
import { adminAuth } from "../../../middlewares/adminAuth.middleware.js";

const router = express.Router();

router.get("/", adminAuth, listFolios);
router.get("/by-pan", adminAuth, foliosByPan);

export default router;
