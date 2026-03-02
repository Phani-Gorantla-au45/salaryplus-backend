import MfJourney from "../../models/mf/mfJourney.model.js";
import MfKyc from "../../models/mf/mfKyc.model.js";
import KycRequest from "../../models/mf/kycRequest.model.js";

/* ------------------------------------------------------------------ */
/*  GET /api/mf/journey-status                                          */
/*  Returns the user's full MF onboarding stage flags.                  */
/*  Frontend uses this to decide which screen to show.                  */
/* ------------------------------------------------------------------ */
export const getJourneyStatus = async (req, res) => {
  try {
    const { uniqueId } = req.user;

    /* ---------- FETCH ALL SOURCES ---------- */
    const [journey, kycCheck, latestKycRequest] = await Promise.all([
      MfJourney.findOne({ uniqueId }),
      MfKyc.findOne({ uniqueId }),
      KycRequest.findOne({ uniqueId }).sort({ createdAt: -1 }),
    ]);

    /* ---------- STAGE 1: RISK PROFILE ---------- */
    const riskProfileStage = journey?.riskProfile ?? { status: "not_started" };

    /* ---------- STAGE 2: KYC CHECK ---------- */
    // overallStatus covers PAN/name/DOB validity
    // kraStatus (from readiness field) covers KRA compliance — independent from overallStatus
    // A user can have overallStatus=VERIFIED but kraStatus=failed, meaning fresh KYC is still needed
    let kycCheckStage = { status: "not_started" };
    if (kycCheck) {
      const panDobVerified = kycCheck.overallStatus === "VERIFIED";
      const kraCompliant   = kycCheck.kraStatus === "verified";

      let derivedStatus;
      if (panDobVerified && kraCompliant) {
        derivedStatus = "compliant";        // KRA compliant — skip KYC submission
      } else if (panDobVerified && !kraCompliant) {
        derivedStatus = "kra_not_compliant"; // PAN valid but needs fresh KYC
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
    if (kycCheck && kycCheckStage.status !== "compliant") {
      // User is not KRA compliant — KYC submission required
      kycSubmitStage = latestKycRequest
        ? { status: latestKycRequest.status, fpKycRequestId: latestKycRequest.fpKycRequestId }
        : { status: "not_started" };
    }

    /* ---------- STAGE 4: ACCOUNT CREATION ---------- */
    const accountStage = journey?.account ?? { status: "not_started" };

    /* ---------- CAN INVEST ---------- */
    const canInvest = journey?.canInvest ?? false;

    /* ---------- DETERMINE CURRENT STEP FOR FRONTEND ---------- */
    let currentStep;
    let nextAction;

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
      // Needs fresh KYC submission
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
          score:       riskProfileStage.score ?? null,
          category:    riskProfileStage.category ?? null,
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
