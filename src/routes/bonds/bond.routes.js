import express from "express";
import { adminAuth } from "../../middlewares/adminAuth.js";
//admin login rotes
import {
  adminSendOtp,
  adminVerifyOtp,
} from "../../controllers/bonds/adminlogin.controller.js";

//admin  access for investers
import {
  addInvestor,
  editInvestor,
  deleteInvestor,
  getAllInvestors,
} from "../../controllers/bonds/adminInvestor.controller.js";

//admin access for investers kyc
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
} from "../../controllers/bonds/bond.controller.js";

import upload from "../../middlewares/upload.middleware.js";

import {
  uploadBondExcel,
  getBondByIsin,
} from "../../controllers/bonds/isindata.js";
import { uploadBondTradesExcel } from "../../controllers/bonds/BondTrades.controller.js";
import {
  adminGetAllBondTransactions,
  updateBondTransactionStatus,
} from "../../controllers/bonds/updateBondStatus.controller.js";
const router = express.Router();

//admin login rotes
router.post("/admin/send-otp", adminSendOtp);
router.post("/admin/verify-otp", adminVerifyOtp);

/* -------- Admin Bond Listing -------- */
router.post("/admin/BondListing", adminAuth, createBond);
router.get("/admin/getallbonds", adminAuth, getBondListings);
router.put("/admin/:bondLaunchId", adminAuth, updateBondByBondLaunchId);
router.get("/admin/:bondLaunchId", adminAuth, getBondByBondLaunchId);

//admin  access for investers
router.post("/admin/add-investers", adminAuth, addInvestor);
router.put("/admin/investors/:uniqueId", adminAuth, editInvestor);
router.delete("/admin/investors/:uniqueId", adminAuth, deleteInvestor);
router.get("/admin/getallinvester", adminAuth, getAllInvestors);

//admin access for investers kyc
router.post("/admin/kyc/:uniqueId", adminAuth, adminAddKyc);
router.put("/admin/kyc/:uniqueId", adminAuth, adminEditKyc);
router.delete("/admin/kyc/:uniqueId", adminAuth, adminDeleteKyc);
router.get("/admin/kyc/status/:uniqueId", adminAuth, adminGetKycStatus);
router.put("/admin/kyc/status/:uniqueId", adminAuth, updateKycStatus);

//transaction details
router.get("/admin/transactions", adminAuth, adminGetAllBondTransactions);
router.put(
  "/admin/transaction/:transactionId/status",
  adminAuth,
  updateBondTransactionStatus,
);

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

export default router;
