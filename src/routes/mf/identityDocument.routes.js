import express from "express";
import {
  createIdentityDocument,
  getIdentityDocument,
} from "../../controllers/mf/identityDocument.controller.js";
import { auth } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// POST /api/mf/identity-document       — create Aadhaar identity doc, get Digilocker redirect URL
router.post("/",          auth, createIdentityDocument);

// GET  /api/mf/identity-document/:id   — poll fetch status after user returns from Digilocker
router.get("/:fpIdDocId", auth, getIdentityDocument);

export default router;
