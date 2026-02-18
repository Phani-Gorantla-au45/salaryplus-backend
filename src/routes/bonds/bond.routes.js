import express from "express";
import {
  createBond,
  getBondListings,
  getBondByBondLaunchId,
} from "../../controllers/bonds/bond.controller.js";
import upload from "../../middlewares/upload.middleware.js";
import {
  uploadBondExcel,
  getBondByIsin,
} from "../../controllers/bonds/isindata.js";
import { uploadBondTradesExcel } from "../../controllers/bonds/BondTrades.controller.js";
import { updateBondTransactionStatus } from "../../controllers/bonds/updateBondStatus.controller.js";
const router = express.Router();

/* -------- Admin Bond Listing -------- */
router.post("/admin/BondListing", createBond);
router.get("/admin/getallbonds", getBondListings);
router.get("/admin/:bondLaunchId", getBondByBondLaunchId);
router.get("/admin/get-by-isin/:isin", getBondByIsin);

router.post("/admin/upload-excel", upload.single("file"), uploadBondExcel);
router.post(
  "/admin/upload-trades-excel",
  upload.single("file"),
  uploadBondTradesExcel,
);
router.put(
  "/transaction/:transactionId/status",

  // verifyAdmin,
  updateBondTransactionStatus,
);
export default router;
