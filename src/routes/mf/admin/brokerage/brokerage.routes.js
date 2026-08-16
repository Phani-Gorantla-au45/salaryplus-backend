import express from "express";
import multer from "multer";
import { adminAuth } from "../../../../middlewares/adminAuth.middleware.js";
import { uploadBrokerageFile, listBrokerageUploads, deleteBrokerageUpload, purgeRecordsByMonth } from "../../../../controllers/mf/admin/brokerage/brokerageUpload.controller.js";
import {
  listAvailableMonths,
  getMonthlyBrokerageReport,
  getBrokerageRecordDetails,
} from "../../../../controllers/mf/admin/brokerage/brokerageReport.controller.js";
import { listAmcCodeMaps, updateAmcCodeMap } from "../../../../controllers/mf/admin/brokerage/amcCodeMap.controller.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } }); // 100MB, CAMS files run large

router.post("/upload",              adminAuth, upload.single("file"), uploadBrokerageFile);
router.get("/uploads",              adminAuth, listBrokerageUploads);
router.delete("/uploads/:uploadId", adminAuth, deleteBrokerageUpload);
router.delete("/records",           adminAuth, purgeRecordsByMonth);

router.get("/months",           adminAuth, listAvailableMonths);
router.get("/report",           adminAuth, getMonthlyBrokerageReport);
router.get("/report/details",   adminAuth, getBrokerageRecordDetails);

router.get("/amc-codes",        adminAuth, listAmcCodeMaps);
router.patch("/amc-codes/:id",  adminAuth, updateAmcCodeMap);

export default router;
