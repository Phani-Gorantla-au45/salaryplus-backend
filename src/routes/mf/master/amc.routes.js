import express from "express";
import { listAmcs, syncAmcs, updateAmcLogo } from "../../../controllers/mf/master/amc.controller.js";

const router = express.Router();

router.get("/",                        listAmcs);
router.post("/sync",                   syncAmcs);
router.patch("/:fpAmcId/logo",         updateAmcLogo);

export default router;
