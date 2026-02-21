import express from "express";
import { adminAuth } from "../../middlewares/adminAuth.js";
import {
  adminSendOtp,
  adminVerifyOtp,
} from "../../controllers/bonds/adminlogin.controller.js";
import {
  addInvestor,
  editInvestor,
  deleteInvestor,
  getAllInvestors,
} from "../../controllers/bonds/adminInvestor.controller.js";
import {
  createBond,
  getBondListings,
  getBondByBondLaunchId,
  updateBondByBondLaunchId,
} from "../../controllers/bonds/bond.controller.js";

import upload from "../../middlewares/upload.middleware.js";

import {
  uploadBondExcel,
  getBondByIsin,
} from "../../controllers/bonds/isindata.js";
import { uploadBondTradesExcel } from "../../controllers/bonds/BondTrades.controller.js";
import { updateBondTransactionStatus } from "../../controllers/bonds/updateBondStatus.controller.js";
const router = express.Router();

//admin login rotes
router.post("/admin/send-otp", adminSendOtp);
router.post("/admin/verify-otp", adminVerifyOtp);

//admin  access for access for investers
router.post("/admin/add-investers", adminAuth, addInvestor);
router.put("/admin/investors/:uniqueId", adminAuth, editInvestor);
router.delete("/admin/investors/:uniqueId", adminAuth, deleteInvestor);
router.get("/admin/getallinvester", adminAuth, getAllInvestors);

/* -------- Admin Bond Listing -------- */
router.post("/admin/BondListing", createBond);
router.get("/admin/getallbonds", getBondListings);
router.put("/admin/:bondLaunchId", updateBondByBondLaunchId);

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
