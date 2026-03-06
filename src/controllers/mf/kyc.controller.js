import MfUserData from "../../models/mf/mfUserData.model.js";
import {
  createPreVerification,
  fetchPreVerification,
} from "../../utils/mf/preVerification.utils.js";

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_TIME_MS = 2 * 60 * 1000;

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const DOB_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/* ------------------------------------------------------------------ */
/*  POST /api/mf/kyc/check-pan                                         */
/* ------------------------------------------------------------------ */
export const checkPanKyc = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const pan  = req.body?.pan?.toUpperCase()?.trim();
    const name = req.body?.name?.trim();
    const dob  = req.body?.dob?.trim();

    if (!pan || !name || !dob) {
      return res.status(400).json({ success: false, message: "pan, name, and dob are required" });
    }
    if (!PAN_REGEX.test(pan)) {
      return res.status(400).json({ success: false, message: "Invalid PAN format" });
    }
    if (!DOB_REGEX.test(dob)) {
      return res.status(400).json({ success: false, message: "Invalid dob format. Use YYYY-MM-DD" });
    }

    const pv   = await createPreVerification(pan, name, dob);
    const pvId = pv.id;

    if (!pvId) {
      console.error("❌ [PAN KYC] Pre-verification response has no id", pv);
      return res.status(502).json({ success: false, message: "Invalid response from KYC provider" });
    }

    const startTime = Date.now();
    let latestPv  = pv;
    let pollCount = 0;

    while (Date.now() - startTime < MAX_POLL_TIME_MS) {
      if (latestPv.status === "completed") break;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      pollCount++;
      latestPv = await fetchPreVerification(pvId);
      console.log(`⏳ [CYBRILLA PV] Poll #${pollCount} — status: ${latestPv.status}`);
    }

    let overallStatus;
    const panResult       = latestPv.pan           || {};
    const nameResult      = latestPv.name          || {};
    const dobResult       = latestPv.date_of_birth || {};
    const readinessResult = latestPv.readiness     || {};

    if (latestPv.status !== "completed") {
      overallStatus = "PENDING";
    } else if (
      (panResult.status === "failed" && panResult.code === "upstream_error") ||
      (nameResult.status === "failed" && nameResult.code === "upstream_error") ||
      (dobResult.status === "failed" && dobResult.code === "upstream_error")
    ) {
      overallStatus = "UPSTREAM_ERROR";
    } else if (panResult.status === "failed") {
      overallStatus = "PAN_FAILED";
    } else if (nameResult.status === "failed") {
      overallStatus = "NAME_MISMATCH";
    } else if (dobResult.status === "failed") {
      overallStatus = "DOB_MISMATCH";
    } else if (
      panResult.status === "verified" &&
      nameResult.status === "verified" &&
      dobResult.status === "verified"
    ) {
      overallStatus = "VERIFIED";
    } else {
      overallStatus = "ERROR";
    }

    console.log(`✅ [CYBRILLA PV] Completed — pan: ${pan}, overallStatus: ${overallStatus}`);

    await MfUserData.findOneAndUpdate(
      { uniqueId },
      {
        $set: {
          kycStatus: {
            pan,
            name,
            dob,
            preVerificationId: pvId,
            overallStatus,
            panStatus:  panResult.status       ?? null,
            panCode:    panResult.code         ?? null,
            nameStatus: nameResult.status      ?? null,
            nameCode:   nameResult.code        ?? null,
            dobStatus:  dobResult.status       ?? null,
            dobCode:    dobResult.code         ?? null,
            kraStatus:  readinessResult.status ?? null,
            kraCode:    readinessResult.code   ?? null,
            kraReason:  readinessResult.reason ?? null,
            rawResponse:    latestPv,
            lastCheckedAt:  new Date(),
          },
        },
      },
      { upsert: true }
    );

    const message = {
      VERIFIED:       "PAN, name, and date of birth are verified",
      PAN_FAILED:     panResult.code === "invalid"
                        ? "PAN number is invalid or non-existent"
                        : panResult.code === "aadhaar_not_linked"
                        ? "Aadhaar is not linked to this PAN"
                        : "PAN validation failed",
      NAME_MISMATCH:  "Name does not match PAN records",
      DOB_MISMATCH:   "Date of birth does not match PAN records",
      UPSTREAM_ERROR: "Upstream error during KYC. Please retry",
      PENDING:        "KYC check is still in progress. Please check status again shortly",
      ERROR:          "KYC returned an unexpected result",
    }[overallStatus];

    return res.status(200).json({
      success: true,
      overallStatus,
      preVerificationId: pvId,
      pan:          { status: panResult.status,  code: panResult.code  ?? null },
      name:         { status: nameResult.status, code: nameResult.code ?? null },
      date_of_birth:{ status: dobResult.status,  code: dobResult.code  ?? null },
      kra: {
        status: readinessResult.status ?? null,
        code:   readinessResult.code   ?? null,
        reason: readinessResult.reason ?? null,
      },
      message,
    });
  } catch (err) {
    console.error("❌ [PAN KYC] Error:", err.message);
    return res.status(500).json({ success: false, message: "PAN KYC check failed" });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/kyc/status                                             */
/* ------------------------------------------------------------------ */
export const getKycStatus = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const record = await MfUserData.findOne({ uniqueId });
    const kyc = record?.kycStatus;

    if (!kyc?.pan) {
      return res.status(404).json({
        success: false,
        message: "No KYC check has been performed yet for this user",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        pan:           kyc.pan,
        name:          kyc.name,
        dob:           kyc.dob,
        overallStatus: kyc.overallStatus,
        panStatus:     kyc.panStatus,
        panCode:       kyc.panCode,
        nameStatus:    kyc.nameStatus,
        nameCode:      kyc.nameCode,
        dobStatus:     kyc.dobStatus,
        dobCode:       kyc.dobCode,
        kra: {
          status: kyc.kraStatus,
          code:   kyc.kraCode,
          reason: kyc.kraReason,
        },
        preVerificationId: kyc.preVerificationId,
        lastCheckedAt:     kyc.lastCheckedAt,
      },
    });
  } catch (err) {
    console.error("❌ [KYC STATUS] Error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to fetch KYC status" });
  }
};
