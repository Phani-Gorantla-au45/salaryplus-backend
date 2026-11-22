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
import { uploadBondTradesExcel, adminGetTradesByIsin } from "../../controllers/bonds/bondTrades.controller.js";
import {
  updateBondTransactionStatus,
  adminGetAllBondTransactions,
} from "../../controllers/bonds/bondStatus.controller.js";

const router = express.Router();

// Admin auth
router.post("/admin/send-otp", adminSendOtp);
router.post("/admin/verify-otp", adminVerifyOtp);

// Investors
router.get("/admin/inv/getallinvestor", getAllInvestors);
router.post("/admin/add-investors", adminAuth, addInvestor);
router.put("/admin/investors/:uniqueId", adminAuth, editInvestor);
router.delete("/admin/investors/:uniqueId", adminAuth, deleteInvestor);

// Bond listings
router.post("/admin/BondListing", adminAuth, createBond);
router.get("/admin/getallbonds", adminAuth, getBondListings);

// Transactions
router.get("/admin/transactions", adminAuth, adminGetAllBondTransactions);
router.put("/admin/transaction/:transactionId/status", adminAuth, updateBondTransactionStatus);
router.put("/transaction/:transactionId/status", updateBondTransactionStatus);

// KYC (specific paths before /:bondLaunchId catch-all)
router.post("/admin/kyc/:uniqueId", adminAuth, adminAddKyc);
router.put("/admin/kyc/:uniqueId", adminAuth, adminEditKyc);
router.delete("/admin/kyc/:uniqueId", adminAuth, adminDeleteKyc);
router.get("/admin/kyc/status/:uniqueId", adminAuth, adminGetKycStatus);
router.put("/admin/kyc/status/:uniqueId", adminAuth, updateKycStatus);

// ISIN cashflow data (must be before /:bondLaunchId catch-all)
router.post("/admin/upload-excel", upload.single("file"), adminAuth, uploadBondExcel);
router.get("/admin/get-by-isin/:isin", adminAuth, getBondByIsin);

// Trades
router.get("/admin/trades", adminAuth, adminGetTradesByIsin);
router.post("/admin/upload-trades-excel", upload.single("file"), uploadBondTradesExcel);

// Bond by ID — catch-all, must be last among GET /admin/* routes
router.get("/admin/:bondLaunchId", adminAuth, getBondByBondLaunchId);
router.put("/admin/:bondLaunchId", adminAuth, updateBondByBondLaunchId);
router.delete("/admin/:bondLaunchId", adminAuth, deleteBondByBondLaunchId);

export default router;
