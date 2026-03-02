import Esign from "../../models/mf/esign.model.js";
import KycRequest from "../../models/mf/kycRequest.model.js";
import { createFpEsign, fetchFpEsign } from "../../utils/mf/esign.utils.js";

/* ------------------------------------------------------------------ */
/*  Helper — map FP response → our DB                                   */
/* ------------------------------------------------------------------ */
const syncToDb = async (uniqueId, fpData) => {
  return Esign.findOneAndUpdate(
    { fpEsignId: fpData.id },
    {
      $set: {
        uniqueId,
        fpKycRequestId: fpData.kyc_request,
        fpEsignId: fpData.id,
        type: fpData.type,
        status: fpData.status,
        redirectUrl: fpData.redirect_url ?? null,
        postbackUrl: fpData.postback_url ?? null,
        rawResponse: fpData,
      },
    },
    { upsert: true, new: true }
  );
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/esign                                                  */
/*  Create esign for a KYC request in esign_required state              */
/* ------------------------------------------------------------------ */
export const createEsign = async (req, res) => {
  try {
    console.log("inside esign");
    const { uniqueId } = req.user;
    const { fpKycRequestId } = req.body;
    const postback_url = "https://wwww.goldbee.in";

    if (!fpKycRequestId || !postback_url) {
      return res.status(400).json({
        success: false,
        message: "fpKycRequestId and postback_url are required",
      });
    }

    /* ---------- VERIFY KYC REQUEST ---------- */
    const kycReq = await KycRequest.findOne({ fpKycRequestId, uniqueId });
    if (!kycReq) {
      return res
        .status(404)
        .json({ success: false, message: "KYC request not found" });
    }

    if (kycReq.status !== "esign_required") {
      return res.status(400).json({
        success: false,
        message: `Esign can only be created when KYC request status is 'esign_required'. Current status: '${kycReq.status}'`,
      });
    }

    /* ---------- CHECK IF ESIGN ALREADY EXISTS AND IS REUSABLE ---------- */
    const existingEsign = await Esign.findOne({
      fpKycRequestId,
      uniqueId,
      status: "pending",
    });
    if (existingEsign) {
      return res.status(200).json({
        success: true,
        message:
          "Esign already exists. Redirect user to redirectUrl to complete signing.",
        fpEsignId: existingEsign.fpEsignId,
        status: existingEsign.status,
        redirectUrl: existingEsign.redirectUrl, // ← redirect_url can be reused
      });
    }

    /* ---------- CALL FP API ---------- */
    const fpData = await createFpEsign({
      kyc_request: fpKycRequestId,
      postback_url,
    });

    /* ---------- PERSIST ---------- */
    const record = await syncToDb(uniqueId, fpData);

    return res.status(201).json({
      success: true,
      message:
        "Esign created. Redirect user to redirectUrl to complete signing.",
      fpEsignId: record.fpEsignId,
      status: record.status,
      redirectUrl: record.redirectUrl, // ← frontend redirects user here
    });
  } catch (err) {
    console.error("❌ [ESIGN] Create error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/esign/:fpEsignId                                        */
/*  Poll esign status — call after user returns from esign page         */
/*  On success, KYC request moves to 'submitted' automatically          */
/* ------------------------------------------------------------------ */
export const getEsign = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { fpEsignId } = req.params;

    const existing = await Esign.findOne({ fpEsignId, uniqueId });
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Esign not found" });
    }

    /* ---------- REFRESH FROM FP ---------- */
    const fpData = await fetchFpEsign(fpEsignId);
    const record = await syncToDb(uniqueId, fpData);

    /* ---------- SYNC KYC REQUEST STATUS IF ESIGN DONE ---------- */
    // FP automatically moves KYC request to 'submitted' after successful esign.
    // Update our local KYC record to reflect this.
    if (record.status === "successful") {
      await KycRequest.findOneAndUpdate(
        { fpKycRequestId: record.fpKycRequestId, uniqueId },
        { $set: { status: "submitted" } }
      );
    }

    return res.status(200).json({
      success: true,
      data: {
        fpEsignId: record.fpEsignId,
        fpKycRequestId: record.fpKycRequestId,
        status: record.status, // pending | successful
        redirectUrl: record.redirectUrl,
      },
    });
  } catch (err) {
    console.error("❌ [ESIGN] Fetch error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
