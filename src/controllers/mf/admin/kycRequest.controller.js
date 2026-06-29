import KycRequest from "../../../models/mf/kycRequest.model.js";
import { fetchFpKycRequest } from "../../../utils/mf/kyc/kycRequest.utils.js";

/* ------------------------------------------------------------------ */
/*  Helper — sync FP response into our DB record (same shape as the     */
/*  user-facing controller's syncToDb, reused here without an ownership */
/*  check since admin can view any investor's KYC request).            */
/* ------------------------------------------------------------------ */
const syncToDb = async (uniqueId, fpData) => {
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
        fpSubmittedAt: fpData.submitted_at ? new Date(fpData.submitted_at) : null,
        fpSuccessfulAt: fpData.successful_at ? new Date(fpData.successful_at) : null,
        fpRejectedAt: fpData.rejected_at ? new Date(fpData.rejected_at) : null,
        rawResponse: fpData,
      },
    },
    { upsert: true, new: true },
  );
};

/* ================================================================
 * GET /api/mf/admin/kyc-request/:fpKycRequestId
 * Admin — fetch & refresh any investor's KYC request by FP id, no
 * ownership check (unlike the investor-facing GET /api/mf/kyc-request/:id).
 * ================================================================ */
export const adminGetKycRequest = async (req, res) => {
  try {
    const { fpKycRequestId } = req.params;

    const existing = await KycRequest.findOne({ fpKycRequestId });
    if (!existing) {
      return res.status(404).json({ success: false, message: "KYC request not found" });
    }

    const fpData = await fetchFpKycRequest(fpKycRequestId);
    const record = await syncToDb(existing.uniqueId, fpData);

    return res.status(200).json({
      success: true,
      data: {
        uniqueId: record.uniqueId,
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
    console.error("❌ [ADMIN KYC REQUEST] Fetch error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
