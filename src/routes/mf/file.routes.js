import express from "express";
import multer from "multer";
import { uploadFile, getFile } from "../../controllers/mf/file.controller.js";
import { auth } from "../../middlewares/auth.middleware.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// POST /api/mf/file/upload  — upload signature (jpg/png) or any KYC document
// Frontend sends: multipart/form-data with field "file"
router.post("/upload", auth, upload.single("file"), uploadFile);

// GET  /api/mf/file/:id     — fetch uploaded file metadata
router.get("/:fpFileId",  auth, getFile);

export default router;
