import { uploadFpFile, fetchFpFile } from "../../utils/mf/file.utils.js";

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "application/pdf",
  "image/tiff",
];
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

/* ------------------------------------------------------------------ */
/*  POST /api/mf/file/upload                                            */
/*  Accepts: multipart/form-data with field "file" (signature image)   */
/*  Returns: fpFileId to pass as "signature" in KYC request            */
/* ------------------------------------------------------------------ */
export const uploadFile = async (req, res) => {
  try {
    console.log("inside file");
    const file = req.file;

    if (!file) {
      return res
        .status(400)
        .json({
          success: false,
          message: "No file uploaded. Use field name 'file'",
        });
    }

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: `Invalid file type '${file.mimetype}'. Allowed: jpg, png, pdf, tiff`,
      });
    }

    if (file.size > MAX_SIZE_BYTES) {
      return res
        .status(400)
        .json({ success: false, message: "File size exceeds 10MB limit" });
    }

    const purpose = req.body?.purpose || "signature";

    const fpData = await uploadFpFile({
      buffer: file.buffer,
      originalname: file.originalname,
      mimetype: file.mimetype,
      purpose,
    });

    return res.status(201).json({
      success: true,
      message: "File uploaded successfully",
      fpFileId: fpData.id, // ← pass this as "signature" in PATCH /kyc-request
      filename: fpData.filename,
      url: fpData.url,
      createdAt: fpData.created_at,
    });
  } catch (err) {
    console.error("❌ [FILE] Upload error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/file/:fpFileId                                          */
/*  Fetch metadata of an already-uploaded file                          */
/* ------------------------------------------------------------------ */
export const getFile = async (req, res) => {
  try {
    const { fpFileId } = req.params;
    const fpData = await fetchFpFile(fpFileId);

    return res.status(200).json({
      success: true,
      fpFileId: fpData.id,
      filename: fpData.filename,
      url: fpData.url,
      size: fpData.byte_size,
    });
  } catch (err) {
    console.error("❌ [FILE] Fetch error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
