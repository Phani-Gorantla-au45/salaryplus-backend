import express from "express";
import { listFolios } from "../../../controllers/mf/admin/folio.controller.js";
import { adminAuth } from "../../../middlewares/adminAuth.middleware.js";

const router = express.Router();

router.get("/", adminAuth, listFolios);

export default router;
