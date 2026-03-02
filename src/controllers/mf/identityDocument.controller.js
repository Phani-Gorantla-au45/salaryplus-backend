import IdentityDocument from "../../models/mf/identityDocument.model.js";
import KycRequest from "../../models/mf/kycRequest.model.js";
import {
  createFpIdentityDocument,
  fetchFpIdentityDocument,
} from "../../utils/mf/identityDocument.utils.js";

/* ------------------------------------------------------------------ */
/*  Helper — map FP response → our DB                                   */
/* ------------------------------------------------------------------ */
const syncToDb = async (uniqueId, fpData) => {
  const data = fpData.fetch?.details || {};
  return IdentityDocument.findOneAndUpdate(
    { fpIdDocId: fpData.id },
    {
      $set: {
        uniqueId,
        fpKycRequestId: fpData.kyc_request,
        fpIdDocId: fpData.id,
        type: fpData.type,
        fetchStatus: fpData.fetch?.status ?? "pending",
        fetchReason: fpData.fetch?.reason ?? null,
        redirectUrl: fpData.fetch?.redirect_url ?? null,
        postbackUrl: fpData.fetch?.postback_url ?? null,
        fetchExpiresAt: fpData.fetch?.expires_at
          ? new Date(fpData.fetch.expires_at)
          : null,
        aadhaarLastFour: data.number ? data.number.slice(-4) : null,
        addressLine1: data.line_1 ?? null,
        city: data.city ?? null,
        pincode: data.pincode ?? null,
        country: data.country ?? null,
        rawResponse: fpData,
      },
    },
    { upsert: true, new: true }
  );
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/identity-document                                      */
/*  Create an Aadhaar identity document for a KYC request               */
/* ------------------------------------------------------------------ */
export const createIdentityDocument = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    console.log("req body", req.body);
    const { fpKycRequestId } = req.body;
    const postback_url = "https:/www.goldbee.in";
    if (!fpKycRequestId || !postback_url) {
      return res.status(400).json({
        success: false,
        message: "fpKycRequestId and postback_url are required",
      });
    }

    /* ---------- VERIFY KYC REQUEST BELONGS TO USER ---------- */
    const kycReq = await KycRequest.findOne({ fpKycRequestId, uniqueId });
    if (!kycReq) {
      return res
        .status(404)
        .json({ success: false, message: "KYC request not found" });
    }

    if (!["pending", "esign_required"].includes(kycReq.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot create identity document for a KYC request in '${kycReq.status}' state`,
      });
    }

    /* ---------- CALL FP API ---------- */
    const fpData = await createFpIdentityDocument({
      kyc_request: fpKycRequestId,
      type: "aadhaar",
      postback_url,
    });

    /* ---------- PERSIST ---------- */
    const record = await syncToDb(uniqueId, fpData);

    return res.status(201).json({
      success: true,
      message:
        "Identity document created. Redirect user to redirectUrl to complete Aadhaar fetch.",
      fpIdDocId: record.fpIdDocId,
      fetchStatus: record.fetchStatus,
      redirectUrl: record.redirectUrl, // ← frontend redirects user here (Digilocker)
      expiresAt: record.fetchExpiresAt,
    });
  } catch (err) {
    console.error("❌ [IDDOC] Create error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/identity-document/:fpIdDocId                           */
/*  Poll fetch status — call after user returns from Digilocker         */
/* ------------------------------------------------------------------ */
export const getIdentityDocument = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { fpIdDocId } = req.params;

    const existing = await IdentityDocument.findOne({ fpIdDocId, uniqueId });
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Identity document not found" });
    }

    /* ---------- REFRESH FROM FP ---------- */
    const fpData = await fetchFpIdentityDocument(fpIdDocId);
    const record = await syncToDb(uniqueId, fpData);
    console.log("record", record);
    return res.status(200).json({
      success: true,
      data: {
        fpIdDocId: record.fpIdDocId,
        fpKycRequestId: record.fpKycRequestId,
        fetchStatus: record.fetchStatus, // pending | successful | failed | expired
        fetchReason: record.fetchReason,
        aadhaarLastFour: record.aadhaarLastFour,
        city: record.city,
        pincode: record.pincode,
        country: record.country,
      },
    });
  } catch (err) {
    console.error("❌ [IDDOC] Fetch error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
