import MfUserData from "../../../models/mf/mfUserData.model.js";
import KycRequest from "../../../models/mf/kycRequest.model.js";

/*
 * Screen name → frontend route mapping
 * ─────────────────────────────────────
 * mf_risk_profile        — complete risk assessment
 * mf_pan_check           — enter PAN, trigger KYC check
 * mf_kyc_submit          — KYC not verified, start DigiLocker submission
 * mf_kyc_esign           — KYC submitted, pending esign
 * mf_kyc_pending         — esign done, waiting for KYC approval
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

    const journey  = mfData?.journey   ?? {};
    const kycCheck = mfData?.kycStatus ?? null;

    /* ── STAGE 1: RISK PROFILE ─────────────────────────────────────── */
    const riskProfile = journey.riskProfile ?? { status: "not_started" };
    if (riskProfile.status !== "completed") {
      return res.status(200).json({
        success: true,
        screen: "mf_risk_profile",
        canInvest: false,
        stage: "risk_profile",
        detail: {
          status: riskProfile.status,
          score:    riskProfile.score    ?? null,
          category: riskProfile.category ?? null,
        },
      });
    }

    /* ── STAGE 2: PAN / KYC CHECK ──────────────────────────────────── */
    if (!kycCheck?.pan) {
      return res.status(200).json({
        success: true,
        screen: "mf_pan_check",
        canInvest: false,
        stage: "kyc_check",
        detail: { status: "not_started" },
      });
    }

    const panVerified = kycCheck.overallStatus === "VERIFIED";
    const kraVerified = kycCheck.kraStatus === "verified";
    const kycCompliant = panVerified && kraVerified;

    /* ── STAGE 3: KYC SUBMISSION (only if not KRA-compliant) ───────── */
    if (!kycCompliant) {
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
          },
        });
      }

      const kycStatus = latestKycRequest.status;

      // Submitted but esign not done
      if (["submitted", "pending"].includes(kycStatus)) {
        return res.status(200).json({
          success: true,
          screen: "mf_kyc_esign",
          canInvest: false,
          stage: "kyc_submission",
          detail: {
            status: kycStatus,
            fpKycRequestId: latestKycRequest.fpKycRequestId,
          },
        });
      }

      // Esign done, waiting for KYC approval
      if (kycStatus === "esign_required" || kycStatus === "under_review") {
        return res.status(200).json({
          success: true,
          screen: "mf_kyc_pending",
          canInvest: false,
          stage: "kyc_submission",
          detail: {
            status: kycStatus,
            fpKycRequestId: latestKycRequest.fpKycRequestId,
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
          detail: { status: kycStatus },
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
        detail: {
          completedSteps: {
            phone:             !!mfData?.phone?.fpPhoneNumberId,
            email:             !!mfData?.email?.fpEmailAddressId,
            investorProfile:   !!mfData?.investorProfile?.fpInvestorProfileId,
            address:           !!mfData?.address?.fpAddressId,
            bankAccount:       !!mfData?.bankAccount?.fpBankAccountId,
            nominee:           !!mfData?.nominee?.fpRelatedPartyId,
            investmentAccount: !!mfData?.investmentAccount?.fpInvestmentAccountId,
          },
        },
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
        riskCategory: riskProfile.category ?? null,
      },
    });

  } catch (err) {
    console.error("❌ [JOURNEY STATUS] Error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to fetch journey status" });
  }
};
