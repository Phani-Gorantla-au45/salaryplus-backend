import express from "express";

import { adminAuth } from "../../middlewares/adminAuth.middleware.js";
import {
  adminSendOtp,
  adminVerifyOtp,
} from "../../controllers/bonds/admin.controller.js";
import {
  addInvestor,
  editInvestor,
  deleteInvestor,
  getAllInvestors,
} from "../../controllers/bonds/adminInvestor.controller.js";

import {
  adminAddKyc,
  adminEditKyc,
  adminDeleteKyc,
  adminGetKycStatus,
  updateKycStatus,
} from "../../controllers/bonds/adminKyc.controller.js";

import {
  createBond,
  getBondListings,
  getBondByBondLaunchId,
  updateBondByBondLaunchId,
  deleteBondByBondLaunchId,
} from "../../controllers/bonds/bond.controller.js";
import upload from "../../middlewares/upload.middleware.js";
import {
  uploadBondExcel,
  getBondByIsin,
} from "../../controllers/bonds/isinData.controller.js";
import { uploadBondTradesExcel } from "../../controllers/bonds/bondTrades.controller.js";
import {
  updateBondTransactionStatus,
  adminGetAllBondTransactions,
} from "../../controllers/bonds/bondStatus.controller.js";

const router = express.Router();

//admin  access for investers
router.get("/admin/inv/getallinvestor", getAllInvestors);
router.post("/admin/add-investors", adminAuth, addInvestor);
router.put("/admin/investors/:uniqueId", adminAuth, editInvestor);
router.delete("/admin/investors/:uniqueId", adminAuth, deleteInvestor);

//admin login rotes
router.post("/admin/send-otp", adminSendOtp);
router.post("/admin/verify-otp", adminVerifyOtp);

/* -------- Admin Bond Listing -------- */
router.post("/admin/BondListing", createBond);
router.get("/admin/getallbonds", getBondListings);
router.put("/admin/:bondLaunchId", updateBondByBondLaunchId);

//transaction details
router.get("/admin/transactions", adminAuth, adminGetAllBondTransactions);
router.put(
  "/admin/transaction/:transactionId/status",
  adminAuth,
  updateBondTransactionStatus,
);

router.get("/admin/:bondLaunchId", getBondByBondLaunchId);
router.get("/admin/get-by-isin/:isin", getBondByIsin);

router.post("/admin/upload-excel", upload.single("file"), uploadBondExcel);

/* -------- Admin Bond Listing -------- */
router.post("/admin/BondListing", adminAuth, createBond);
router.get("/admin/getallbonds", getBondListings);
router.put("/admin/:bondLaunchId", adminAuth, updateBondByBondLaunchId);
router.get("/admin/:bondLaunchId", adminAuth, getBondByBondLaunchId);
router.delete("/admin/:bondLaunchId", adminAuth, deleteBondByBondLaunchId);

router.post("/admin/kyc/:uniqueId", adminAuth, adminAddKyc);
router.put("/admin/kyc/:uniqueId", adminAuth, adminEditKyc);
router.delete("/admin/kyc/:uniqueId", adminAuth, adminDeleteKyc);
router.get("/admin/kyc/status/:uniqueId", adminAuth, adminGetKycStatus);
router.put("/admin/kyc/status/:uniqueId", adminAuth, updateKycStatus);

//admin isin excel upload
router.post(
  "/admin/upload-excel",
  upload.single("file"),
  adminAuth,
  uploadBondExcel,
);
router.get("/admin/get-by-isin/:isin", adminAuth, getBondByIsin);
//admin trade excel upload

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
