import express from "express";
import {
  createMandate,
  authorizeMandate,
  listMandates,
  getMandate,
  cancelMandate,
  mandateAuthCallback,
} from "../../../controllers/mf/mandate/mandate.controller.js";
import { auth } from "../../../middlewares/auth.middleware.js";

const router = express.Router();

// Postback from FP — no auth (FP POSTs form data here)
router.post("/auth-callback", mandateAuthCallback);

// Authenticated user routes
router.post("/",                 auth, createMandate);
router.get("/",                  auth, listMandates);
router.get("/:id",               auth, getMandate);
router.post("/:id/authorize",    auth, authorizeMandate);
router.post("/:id/cancel",       auth, cancelMandate);

export default router;
