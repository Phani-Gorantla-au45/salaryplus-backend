import express from "express";
import { createBond } from "../../controllers/bonds/bond.controller.js";
import upload from "../../middlewares/upload.middleware.js";
import { uploadBondExcel } from "../../controllers/bonds/isindata.js";
import { uploadBondTradesExcel } from "../../controllers/bonds/BondTrades.controller.js";
const router = express.Router();

/* -------- Admin Bond Listing -------- */
router.post("/admin/BondListing", createBond);
router.post("/admin/upload-excel", upload.single("file"), uploadBondExcel);
router.post(
  "/admin/upload-trades-excel",
  upload.single("file"),
  uploadBondTradesExcel,
);
export default router;
