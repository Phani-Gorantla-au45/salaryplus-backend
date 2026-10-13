import express from "express";
import { auth } from "../../../middlewares/auth.middleware.js";
import { adminAuth } from "../../../middlewares/adminAuth.middleware.js";
import {
  listV2Baskets,
  createV2Basket,
  updateV2Basket,
  addFundToBasket,
  updateFundInBasket,
} from "../../../controllers/mf/smartSaving/smartSavingV2.controller.js";
import {
  getV2Basket,
  previewSmartInvest,
  smartInvest,
  previewSmartRedeem,
  smartRedeem,
  confirmSmartRedeem,
} from "../../../controllers/mf/smartSaving/smartSavingV2.controller.js";

const router = express.Router();

/* ── Admin ──────────────────────────────────────────────────────────── */
// GET    /api/mf/smart-saving-v2/admin             — list all baskets
// POST   /api/mf/smart-saving-v2/admin             — create new basket (deactivates old)
// PATCH  /api/mf/smart-saving-v2/admin/:id         — update basket meta
// POST   /api/mf/smart-saving-v2/admin/:id/funds   — add a fund to existing basket
// PATCH  /api/mf/smart-saving-v2/admin/:id/funds/:isin — update one fund in basket
router.get(   "/admin",                    adminAuth, listV2Baskets);
router.post(  "/admin",                    adminAuth, createV2Basket);
router.patch( "/admin/:id",                adminAuth, updateV2Basket);
router.post(  "/admin/:id/funds",          adminAuth, addFundToBasket);
router.patch( "/admin/:id/funds/:isin",    adminAuth, updateFundInBasket);

/* ── User (auth required) ───────────────────────────────────────────── */
// GET  /api/mf/smart-saving-v2/basket            — active basket + user holdings + instant capacity
// GET  /api/mf/smart-saving-v2/invest/preview    — preview allocation for ?amount=X
// POST /api/mf/smart-saving-v2/invest            — smart invest (creates batch purchase)
// GET  /api/mf/smart-saving-v2/redeem/preview    — preview instant/normal split for ?amount=X
// POST /api/mf/smart-saving-v2/redeem            — smart redeem (creates all orders + sends OTP)
// POST /api/mf/smart-saving-v2/redeem/confirm    — confirm all orders with single OTP

// Static paths before param paths to avoid route conflicts
router.get("/redeem/preview",        auth, previewSmartRedeem);
router.post("/redeem/confirm",       auth, confirmSmartRedeem);
router.post("/redeem",               auth, smartRedeem);

router.get("/invest/preview",        auth, previewSmartInvest);
router.post("/invest",               auth, smartInvest);

router.get("/basket",                auth, getV2Basket);

export default router;
