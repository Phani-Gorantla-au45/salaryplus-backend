import express from "express";
import {
  createAddress, getAddress,
  createOverseasAddress, getOverseasAddress,
} from "../../../controllers/mf/onboarding/address.controller.js";
import { auth } from "../../../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/",          auth, createAddress);
router.get("/",           auth, getAddress);

// NRI overseas address
router.post("/overseas",  auth, createOverseasAddress);
router.get("/overseas",   auth, getOverseasAddress);

export default router;
