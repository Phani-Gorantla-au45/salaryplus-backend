import express from "express";
import multer from "multer";
import { auth } from "../../middlewares/auth.middleware.js";
import { uploadBwBondDocument } from "../../controllers/bonds/bwBondUpload.controller.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/upload", auth, upload.single("file"), uploadBwBondDocument);

export default router;
