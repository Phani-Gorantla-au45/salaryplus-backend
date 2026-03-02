import express from "express";
import {
  getRelatedPartyEnums,
  createRelatedParty,
  listRelatedParties,
  getRelatedParty,
} from "../../controllers/mf/relatedParty.controller.js";
import { auth } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// GET  /api/mf/related-party/enums           — relationship dropdown (no auth)
router.get("/enums",               getRelatedPartyEnums);

// POST /api/mf/related-party                 — add a nominee
router.post("/",        auth,      createRelatedParty);

// GET  /api/mf/related-party                 — list all nominees
router.get("/",         auth,      listRelatedParties);

// GET  /api/mf/related-party/:id             — get specific nominee (MUST be after /enums)
router.get("/:fpRelatedPartyId", auth, getRelatedParty);

export default router;
