import MfUserData from "../../models/mf/mfUserData.model.js";
import KycRequest from "../../models/mf/kycRequest.model.js";

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

    /* ---------- STAGE 1: RISK PROFILE ---------- */
    const riskProfileStage = journey.riskProfile ?? { status: "not_started" };

    /* ---------- STAGE 2: KYC CHECK ---------- */
    let kycCheckStage = { status: "not_started" };
    if (kycCheck?.pan) {
      const panDobVerified = kycCheck.overallStatus === "VERIFIED";
      const kraCompliant   = kycCheck.kraStatus === "verified";

      let derivedStatus;
      if (panDobVerified && kraCompliant) {
        derivedStatus = "compliant";
      } else if (panDobVerified && !kraCompliant) {
        derivedStatus = "kra_not_compliant";
      } else {
        derivedStatus = kycCheck.overallStatus?.toLowerCase() ?? "not_started";
      }

      kycCheckStage = {
        status:     derivedStatus,
        panStatus:  kycCheck.panStatus,
        nameStatus: kycCheck.nameStatus,
        dobStatus:  kycCheck.dobStatus,
        kra: {
          status: kycCheck.kraStatus,
          code:   kycCheck.kraCode,
          reason: kycCheck.kraReason,
        },
      };
    }

    /* ---------- STAGE 3: KYC SUBMISSION ---------- */
    let kycSubmitStage = { status: "not_applicable" };
    if (kycCheck?.pan && kycCheckStage.status !== "compliant") {
      kycSubmitStage = latestKycRequest
        ? { status: latestKycRequest.status, fpKycRequestId: latestKycRequest.fpKycRequestId }
        : { status: "not_started" };
    }

    /* ---------- STAGE 4: ACCOUNT CREATION ---------- */
    const accountStage = journey.account ?? { status: "not_started" };
    const canInvest    = journey.canInvest ?? false;

    /* ---------- CURRENT STEP ---------- */
    let currentStep, nextAction;

    if (riskProfileStage.status !== "completed") {
      currentStep = "risk_profile";
      nextAction  = "Complete your risk profile assessment";
    } else if (kycCheckStage.status === "not_started") {
      currentStep = "kyc_check";
      nextAction  = "Verify your PAN (KRA compliance check)";
    } else if (kycCheckStage.status === "compliant") {
      if (accountStage.status !== "completed") {
        currentStep = "account_creation";
        nextAction  = "Create your investor account";
      } else {
        currentStep = "invest";
        nextAction  = null;
      }
    } else if (["kra_not_compliant", "pan_failed", "name_mismatch", "dob_mismatch"].includes(kycCheckStage.status)) {
      if (!latestKycRequest || latestKycRequest.status === "not_started") {
        currentStep = "kyc_submission_start";
        nextAction  = "Submit your KYC application";
      } else if (latestKycRequest.status === "successful") {
        if (accountStage.status !== "completed") {
          currentStep = "account_creation";
          nextAction  = "Create your investor account";
        } else {
          currentStep = "invest";
          nextAction  = null;
        }
      } else {
        currentStep = "kyc_submission_in_progress";
        nextAction  = `Complete your KYC application (status: ${latestKycRequest.status})`;
      }
    } else {
      currentStep = "kyc_check";
      nextAction  = "KYC check in progress or error — please retry";
    }

    return res.status(200).json({
      success: true,
      canInvest,
      currentStep,
      nextAction,
      stages: {
        riskProfile: {
          status:      riskProfileStage.status,
          score:       riskProfileStage.score       ?? null,
          category:    riskProfileStage.category    ?? null,
          completedAt: riskProfileStage.completedAt ?? null,
        },
        kycCheck: kycCheckStage,
        kycSubmission: kycSubmitStage,
        accountCreation: {
          status:      accountStage.status,
          completedAt: accountStage.completedAt ?? null,
        },
      },
    });
  } catch (err) {
    console.error("❌ [JOURNEY STATUS] Error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to fetch journey status" });
  }
};
