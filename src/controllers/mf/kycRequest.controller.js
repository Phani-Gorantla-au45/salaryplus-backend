import KycRequest from "../../models/mf/kycRequest.model.js";
import IdentityDocument from "../../models/mf/identityDocument.model.js";
import Esign from "../../models/mf/esign.model.js";
import {
  createFpKycRequest,
  updateFpKycRequest,
  fetchFpKycRequest,
  simulateFpKycRequest,
} from "../../utils/mf/kycRequest.utils.js";
import { validateKycFields } from "../../utils/mf/kycValidation.utils.js";

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const DOB_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/* ------------------------------------------------------------------ */
/*  Helper — sync FP response into our DB record                        */
/* ------------------------------------------------------------------ */
const syncToDb = async (uniqueId, fpData, extra = {}) => {
  return KycRequest.findOneAndUpdate(
    { fpKycRequestId: fpData.id },
    {
      $set: {
        uniqueId,
        fpKycRequestId: fpData.id,
        status: fpData.status,
        pan: fpData.pan,
        name: fpData.name,
        email: fpData.email,
        dob: fpData.date_of_birth,
        fieldsNeeded: fpData.requirements?.fields_needed ?? [],
        verificationStatus: fpData.verification?.status ?? null,
        verificationDetails: fpData.verification?.details_verbose ?? null,
        fpExpiresAt: fpData.expires_at ? new Date(fpData.expires_at) : null,
        fpSubmittedAt: fpData.submitted_at
          ? new Date(fpData.submitted_at)
          : null,
        fpSuccessfulAt: fpData.successful_at
          ? new Date(fpData.successful_at)
          : null,
        fpRejectedAt: fpData.rejected_at ? new Date(fpData.rejected_at) : null,
        rawResponse: fpData,
        ...extra,
      },
    },
    { upsert: true, new: true }
  );
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/kyc-request                                            */
/*  Create a new KYC request (minimum required fields)                  */
/* ------------------------------------------------------------------ */
export const createKycRequest = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { name, pan, email, dob, mobile, ...rest } = req.body;

    /* ---------- VALIDATE REQUIRED FIELDS ---------- */
    if (!name || !pan || !email || !dob || !mobile?.number) {
      return res.status(400).json({
        success: false,
        message: "name, pan, email, dob, and mobile.number are required",
      });
    }

    const panUpper = pan.toUpperCase().trim();

    if (!PAN_REGEX.test(panUpper)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid PAN format" });
    }

    if (!DOB_REGEX.test(dob)) {
      return res.status(400).json({
        success: false,
        message: "Invalid dob format. Use YYYY-MM-DD",
      });
    }

    /* ---------- VALIDATE ENUM FIELDS ---------- */
    const { valid, errors } = validateKycFields(rest);
    if (!valid) {
      return res
        .status(400)
        .json({ success: false, message: "Validation failed", errors });
    }

    /* ---------- CHECK FOR EXISTING ACTIVE REQUEST ---------- */
    const existing = await KycRequest.findOne({
      uniqueId,
      status: { $in: ["pending", "esign_required", "submitted"] },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: `You already have an active KYC request (status: ${existing.status})`,
        fpKycRequestId: existing.fpKycRequestId,
        status: existing.status,
        fieldsNeeded: existing.fieldsNeeded,
      });
    }

    /* ---------- BUILD FP PAYLOAD ---------- */
    const payload = {
      name: name.trim(),
      pan: panUpper,
      email: email.trim(),
      date_of_birth: dob,
      mobile: {
        isd: mobile.isd || "+91",
        number: mobile.number,
      },
      ...rest, // any additional fields from frontend (geolocation, signature, etc.)
    };

    /* ---------- CALL FP API ---------- */
    const fpData = await createFpKycRequest(payload);

    /* ---------- PERSIST TO OUR DB ---------- */
    const record = await syncToDb(uniqueId, fpData);

    return res.status(201).json({
      success: true,
      message: "KYC request created",
      fpKycRequestId: record.fpKycRequestId,
      status: record.status,
      fieldsNeeded: record.fieldsNeeded,
      expiresAt: record.fpExpiresAt,
    });
  } catch (err) {
    console.error("❌ [KYC REQUEST] Create error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  PATCH /api/mf/kyc-request/:fpKycRequestId                          */
/*  Incrementally update a KYC request                                  */
/* ------------------------------------------------------------------ */
export const updateKycRequest = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { fpKycRequestId } = req.params;

    /* ---------- VERIFY OWNERSHIP ---------- */
    const existing = await KycRequest.findOne({ fpKycRequestId, uniqueId });
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "KYC request not found" });
    }

    if (
      ["submitted", "successful", "rejected", "expired"].includes(
        existing.status
      )
    ) {
      return res.status(400).json({
        success: false,
        message: `Cannot update a KYC request in '${existing.status}' state`,
      });
    }

    /* ---------- VALIDATE ENUM FIELDS ---------- */
    const { valid, errors } = validateKycFields(req.body);
    if (!valid) {
      return res
        .status(400)
        .json({ success: false, message: "Validation failed", errors });
    }

    /* ---------- CALL FP API ---------- */
    const fpData = await updateFpKycRequest(fpKycRequestId, req.body);

    /* ---------- SYNC TO DB ---------- */
    const record = await syncToDb(uniqueId, fpData);

    return res.status(200).json({
      success: true,
      message: "KYC request updated",
      fpKycRequestId: record.fpKycRequestId,
      status: record.status,
      fieldsNeeded: record.fieldsNeeded,
      expiresAt: record.fpExpiresAt,
    });
  } catch (err) {
    console.error("❌ [KYC REQUEST] Update error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/kyc-request/:fpKycRequestId                            */
/*  Fetch a specific KYC request (refresh from FP)                      */
/* ------------------------------------------------------------------ */
export const getKycRequest = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { fpKycRequestId } = req.params;

    /* ---------- VERIFY OWNERSHIP ---------- */
    const existing = await KycRequest.findOne({ fpKycRequestId, uniqueId });
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "KYC request not found" });
    }

    /* ---------- REFRESH FROM FP ---------- */
    const fpData = await fetchFpKycRequest(fpKycRequestId);
    const record = await syncToDb(uniqueId, fpData);

    return res.status(200).json({
      success: true,
      data: {
        fpKycRequestId: record.fpKycRequestId,
        status: record.status,
        pan: record.pan,
        name: record.name,
        email: record.email,
        dob: record.dob,
        fieldsNeeded: record.fieldsNeeded,
        verificationStatus: record.verificationStatus,
        verificationDetails: record.verificationDetails,
        expiresAt: record.fpExpiresAt,
        submittedAt: record.fpSubmittedAt,
        successfulAt: record.fpSuccessfulAt,
        rejectedAt: record.fpRejectedAt,
      },
    });
  } catch (err) {
    console.error("❌ [KYC REQUEST] Fetch error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/kyc-request                                             */
/*  List all KYC requests for the logged-in user                        */
/* ------------------------------------------------------------------ */
export const listKycRequests = async (req, res) => {
  try {
    const { uniqueId } = req.user;

    const records = await KycRequest.find({ uniqueId }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: records.map((r) => ({
        fpKycRequestId: r.fpKycRequestId,
        status: r.status,
        pan: r.pan,
        name: r.name,
        fieldsNeeded: r.fieldsNeeded,
        expiresAt: r.fpExpiresAt,
        createdAt: r.createdAt,
      })),
    });
  } catch (err) {
    console.error("❌ [KYC REQUEST] List error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/kyc-request/resume                                      */
/*  Returns the user's latest active KYC request with all linked data   */
/*  (identity document + esign) so the frontend can resume mid-flow.   */
/* ------------------------------------------------------------------ */
export const getKycResume = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    console.log("Inside resume", uniqueId);

    /* ---------- FIND LATEST ACTIVE REQUEST ---------- */
    const existing = await KycRequest.findOne({
      uniqueId,
      status: { $in: ["pending", "esign_required", "submitted"] },
    }).sort({ createdAt: -1 });

    if (!existing) {
      return res.status(200).json({
        success: true,
        hasActiveRequest: false,
        currentSection: "not_started",
        message: "No active KYC request found. Start a new one.",
      });
    }

    /* ---------- REFRESH FROM FP ---------- */
    const fpData = await fetchFpKycRequest(existing.fpKycRequestId);
    const record = await syncToDb(uniqueId, fpData);

    /* ---------- LOAD LINKED IDENTITY DOC + ESIGN ---------- */
    const [identityDoc, esign] = await Promise.all([
      IdentityDocument.findOne({ fpKycRequestId: record.fpKycRequestId }).sort({
        createdAt: -1,
      }),
      Esign.findOne({ fpKycRequestId: record.fpKycRequestId }).sort({
        createdAt: -1,
      }),
    ]);

    /* ---------- DERIVE CURRENT SECTION ---------- */
    // Tells the frontend which screen to resume on
    let currentSection;

    if (record.status === "submitted") {
      currentSection = "submitted"; // Waiting for FP verification — show status screen
    } else if (record.status === "esign_required") {
      currentSection = "esign"; // Esign pending — show esign redirect screen
    } else {
      // status === "pending" — check what's still missing
      const needed = record.fieldsNeeded ?? [];

      if (
        needed.includes("identity_proof") &&
        identityDoc?.fetchStatus !== "successful"
      ) {
        currentSection = "identity_proof"; // Aadhaar/DigiLocker not done yet
      } else if (needed.includes("signature")) {
        currentSection = "signature"; // Signature upload pending
      } else if (needed.length > 0) {
        currentSection = "basic_details"; // Other fields still missing
      } else {
        currentSection = "review"; // All fields filled, ready to submit
      }
    }
    console.log("kyc sent deatails", record);
    /* ---------- RESPONSE ---------- */
    return res.status(200).json({
      success: true,
      hasActiveRequest: true,
      currentSection,
      kycRequest: {
        fpKycRequestId: record.fpKycRequestId,
        status: record.status,
        pan: record.pan,
        name: record.name,
        email: record.email,
        dob: record.dob,
        fieldsNeeded: record.fieldsNeeded,
        verificationStatus: record.verificationStatus,
        expiresAt: record.fpExpiresAt,
        submittedAt: record.fpSubmittedAt,
      },
      identityDocument: identityDoc
        ? {
            fpIdDocId: identityDoc.fpIdDocId,
            fetchStatus: identityDoc.fetchStatus,
            redirectUrl: identityDoc.redirectUrl,
            aadhaarLastFour: identityDoc.aadhaarLastFour,
            fetchExpiresAt: identityDoc.fetchExpiresAt,
          }
        : null,
      esign: esign
        ? {
            fpEsignId: esign.fpEsignId,
            status: esign.status,
            redirectUrl: esign.redirectUrl,
          }
        : null,
    });
  } catch (err) {
    console.error("❌ [KYC RESUME] Error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch KYC resume state" });
  }
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/kyc-request/:fpKycRequestId/simulate  (Sandbox only)  */
/*  Simulate KYC request status change                                  */
/* ------------------------------------------------------------------ */
export const simulateKycRequest = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { fpKycRequestId } = req.params;
    const { status } = req.body;

    const ALLOWED = ["successful", "rejected", "expired"];
    if (!status || !ALLOWED.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `status must be one of: ${ALLOWED.join(", ")}`,
      });
    }

    const existing = await KycRequest.findOne({ fpKycRequestId, uniqueId });
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "KYC request not found" });
    }

    const fpData = await simulateFpKycRequest(fpKycRequestId, status);
    const record = await syncToDb(uniqueId, fpData);

    return res.status(200).json({
      success: true,
      message: `KYC request simulated to '${status}'`,
      fpKycRequestId: record.fpKycRequestId,
      status: record.status,
    });
  } catch (err) {
    console.error("❌ [KYC REQUEST] Simulate error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
