import { uploadToCloudinary } from "../../utils/bonds/cloudinary.utils.js";

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "application/pdf",
];

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_DOC_TYPES = ["pan", "address_proof", "bank_proof", "demat_proof"];

/* ================================================================
 * UPLOAD BOND KYC DOCUMENT
 * POST /api/bw/bonds/kyc/upload
 *
 * Form fields:
 *   file     — the file (multipart)
 *   docType  — "pan" | "address_proof" | "bank_proof" | "demat_proof"
 * ================================================================ */
export const uploadBwBondDocument = async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded. Use field name 'file'",
      });
    }

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: `Invalid file type. Allowed: jpg, png, pdf`,
      });
    }

    if (file.size > MAX_SIZE_BYTES) {
      return res.status(400).json({
        success: false,
        message: "File size exceeds 10 MB",
      });
    }

    const { docType } = req.body;
    if (!docType || !ALLOWED_DOC_TYPES.includes(docType)) {
      return res.status(400).json({
        success: false,
        message: `docType is required. Allowed values: ${ALLOWED_DOC_TYPES.join(", ")}`,
      });
    }

    const { uniqueId } = req.user;
    const folder = `bw-bond-kyc/${uniqueId}/${docType}`;

    const { url } = await uploadToCloudinary(file.buffer, { folder });

    return res.status(200).json({
      success: true,
      message: "File uploaded successfully",
      url,
      docType,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
