import express from "express";
import {
  createMandate,
  authorizeMandate,
  listMandates,
  getMandate,
  cancelMandate,
  mandateAuthCallback,
  getMandatesFromFp,
} from "../../../controllers/mf/mandate/mandate.controller.js";
import { auth } from "../../../middlewares/auth.middleware.js";

const router = express.Router();

// Postback from FP — no auth (FP POSTs form data here)
// FP sends an HTML form POST (application/x-www-form-urlencoded) — server only parses JSON globally
router.post("/auth-callback", express.urlencoded({ extended: true }), mandateAuthCallback);

// Authenticated user routes
router.post("/",                 auth, createMandate);
router.get("/",                  auth, listMandates);
router.get("/fp",                auth, getMandatesFromFp); // GET /api/mf/mandate/fp — list from FP directly
router.get("/:id",               auth, getMandate);
router.post("/:id/authorize",    auth, authorizeMandate);
router.post("/:id/cancel",       auth, cancelMandate);

export default router;
