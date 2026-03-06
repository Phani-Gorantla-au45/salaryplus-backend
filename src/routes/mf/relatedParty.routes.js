import express from "express";
import {
  getRelatedPartyEnums,
  createRelatedParty,
  updateRelatedParty,
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

// PATCH /api/mf/related-party/:id            — update nominee (MUST be before /:id GET)
router.patch("/:fpRelatedPartyId", auth, updateRelatedParty);

// GET  /api/mf/related-party/:id             — get specific nominee
router.get("/:fpRelatedPartyId",   auth, getRelatedParty);

export default router;
