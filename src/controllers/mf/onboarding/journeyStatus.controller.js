import MfUserData from "../../../models/mf/mfUserData.model.js";
import KycRequest from "../../../models/mf/kycRequest.model.js";

/*
 * Screen name → frontend route mapping
 * ─────────────────────────────────────
 * mf_risk_profile        — complete risk assessment
 * mf_pan_check           — enter PAN, trigger KYC check
 * mf_kyc_submit          — KYC not verified / in progress (FP status: none, pending, rejected, expired)
 * mf_kyc_esign           — details done, Aadhaar eSign pending (FP status: esign_required)
 * mf_kyc_pending         — eSign done, submitted & under review (FP status: submitted, under_review)
 *
 * FP kyc_request lifecycle: pending → esign_required → submitted → successful | rejected | expired
 * KYC-stage responses also carry detail.completedSteps + detail.accountCreated, because users
 * may open their investment account while KYC is still under review.
 * mf_account_phone       — add & verify phone number
 * mf_account_email       — add & verify email
 * mf_account_profile     — fill investor profile (name, DOB, occupation…)
 * mf_account_address     — add address
 * mf_account_bank        — link bank account
 * mf_account_nominee     — add nominee
 * mf_account_create      — create investment account (final step)
 * mf_ready               — fully onboarded, can invest
 */

/* ------------------------------------------------------------------ */
/*  Internal — derive account creation sub-step from MfUserData fields  */
/* ------------------------------------------------------------------ */
const accountSubStep = (mfData) => {
  if (!mfData?.phone?.fpPhoneNumberId)           return "mf_account_phone";
  if (!mfData?.email?.fpEmailAddressId)          return "mf_account_email";
  if (!mfData?.investorProfile?.fpInvestorProfileId) return "mf_account_profile";
  if (!mfData?.address?.fpAddressId)             return "mf_account_address";
  if (!mfData?.bankAccount?.fpBankAccountId)     return "mf_account_bank";
  if (!mfData?.nominee?.fpRelatedPartyId)        return "mf_account_nominee";
  if (!mfData?.investmentAccount?.fpInvestmentAccountId) return "mf_account_create";
  return "mf_ready";
};

const completedStepsOf = (mfData) => ({
  phone:             !!mfData?.phone?.fpPhoneNumberId,
  email:             !!mfData?.email?.fpEmailAddressId,
  investorProfile:   !!mfData?.investorProfile?.fpInvestorProfileId,
  address:           !!mfData?.address?.fpAddressId,
  bankAccount:       !!mfData?.bankAccount?.fpBankAccountId,
  nominee:           !!mfData?.nominee?.fpRelatedPartyId,
  investmentAccount: !!mfData?.investmentAccount?.fpInvestmentAccountId,
});

/* ------------------------------------------------------------------ */
/*  GET /api/mf/journey-status                                          */
/* ------------------------------------------------------------------ */
export const getJourneyStatus = async (req, res) => {
  try {
    const { uniqueId } = req.user;

    const [mfData, latestKycRequest] = await Promise.all([
      MfUserData.findOne({ uniqueId }),
      KycRequest.findOne({ uniqueId }).sort({ createdAt: -1 }),
    ]);

    const kycCheck = mfData?.kycStatus ?? null;

    /* ── STAGE 1: PAN / KYC CHECK ──────────────────────────────────── */
    if (!kycCheck?.pan) {
      return res.status(200).json({
        success: true,
        screen: "mf_pan_check",
        canInvest: false,
        stage: "kyc_check",
        detail: { status: "not_started" },
      });
    }

    // Last check had validation failures — user must correct and retry
    const failedStatuses = ["PAN_FAILED", "NAME_MISMATCH", "DOB_MISMATCH", "UPSTREAM_ERROR", "ERROR"];
    if (failedStatuses.includes(kycCheck.overallStatus)) {
      const errorMessage = {
        PAN_FAILED:     kycCheck.panCode === "invalid" ? "PAN number is invalid or non-existent" : "PAN validation failed",
        NAME_MISMATCH:  "Name does not match PAN records. Please re-enter your name as on PAN card.",
        DOB_MISMATCH:   "Date of birth does not match PAN records. Please check and retry.",
        UPSTREAM_ERROR: "KYC check failed due to a provider error. Please retry.",
        ERROR:          "KYC returned an unexpected result. Please retry.",
      }[kycCheck.overallStatus];

      return res.status(200).json({
        success: true,
        screen: "mf_pan_check",
        canInvest: false,
        stage: "kyc_check",
        detail: {
          status:        kycCheck.overallStatus,
          panStatus:     kycCheck.panStatus  ?? null,
          nameStatus:    kycCheck.nameStatus ?? null,
          dobStatus:     kycCheck.dobStatus  ?? null,
          message:       errorMessage,
        },
      });
    }

    const panVerified  = kycCheck.overallStatus === "VERIFIED";
    const kraVerified  = kycCheck.kraStatus === "verified";
    const kycCompliant = panVerified && kraVerified;

    /* ── STAGE 3: KYC SUBMISSION (only if not KRA-compliant) ───────── */
    if (!kycCompliant) {
      const completedSteps = completedStepsOf(mfData);
      const accountCreated = completedSteps.investmentAccount;

      // No KYC request yet — need to start
      if (!latestKycRequest) {
        return res.status(200).json({
          success: true,
          screen: "mf_kyc_submit",
          canInvest: false,
          stage: "kyc_submission",
          detail: {
            status: "not_started",
            panStatus:  kycCheck.panStatus,
            kraStatus:  kycCheck.kraStatus,
            completedSteps,
            accountCreated,
          },
        });
      }

      const kycStatus = latestKycRequest.status;

      // Details still being filled — continue KYC
      if (kycStatus === "pending") {
        return res.status(200).json({
          success: true,
          screen: "mf_kyc_submit",
          canInvest: false,
          stage: "kyc_submission",
          detail: { status: kycStatus, fpKycRequestId: latestKycRequest.fpKycRequestId, completedSteps, accountCreated },
        });
      }

      // All details done — only Aadhaar eSign left
      if (kycStatus === "esign_required") {
        return res.status(200).json({
          success: true,
          screen: "mf_kyc_esign",
          canInvest: false,
          stage: "kyc_submission",
          detail: { status: kycStatus, fpKycRequestId: latestKycRequest.fpKycRequestId, completedSteps, accountCreated },
        });
      }

      // eSign done → submitted to KRA, waiting for approval (usually 1–3 business days)
      if (kycStatus === "submitted" || kycStatus === "under_review") {
        return res.status(200).json({
          success: true,
          screen: "mf_kyc_pending",
          canInvest: false,
          stage: "kyc_submission",
          detail: {
            status: kycStatus,
            fpKycRequestId: latestKycRequest.fpKycRequestId,
            submittedAt: latestKycRequest.updatedAt ?? latestKycRequest.createdAt ?? null,
            completedSteps,
            accountCreated,
          },
        });
      }

      // Rejected / expired — restart KYC
      if (["rejected", "expired"].includes(kycStatus)) {
        return res.status(200).json({
          success: true,
          screen: "mf_kyc_submit",
          canInvest: false,
          stage: "kyc_submission",
          detail: {
            status: kycStatus,
            fpKycRequestId: latestKycRequest.fpKycRequestId,
            message: kycStatus === "rejected"
              ? "Your KYC was rejected. Please resubmit."
              : "Your KYC session expired. Please resubmit.",
            completedSteps,
            accountCreated,
          },
        });
      }

      // KYC successful — fall through to account creation below
      if (kycStatus !== "successful") {
        return res.status(200).json({
          success: true,
          screen: "mf_kyc_pending",
          canInvest: false,
          stage: "kyc_submission",
          detail: { status: kycStatus, completedSteps, accountCreated },
        });
      }
    }

    /* ── STAGE 4: MF ACCOUNT CREATION (sub-steps) ──────────────────── */
    const nextScreen = accountSubStep(mfData);

    if (nextScreen !== "mf_ready") {
      return res.status(200).json({
        success: true,
        screen: nextScreen,
        canInvest: false,
        stage: "account_creation",
        detail: { completedSteps: completedStepsOf(mfData) },
      });
    }

    /* ── READY TO INVEST ───────────────────────────────────────────── */
    return res.status(200).json({
      success: true,
      screen: "mf_ready",
      canInvest: true,
      stage: "ready",
      detail: {
        fpInvestmentAccountId: mfData.investmentAccount.fpInvestmentAccountId,
      },
    });

  } catch (err) {
    console.error("❌ [JOURNEY STATUS] Error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to fetch journey status" });
  }
};
