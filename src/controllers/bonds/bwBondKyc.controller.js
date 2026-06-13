import BwBondKyc from "../../models/bonds/bwBondKyc.model.js";
import RegistrationUser from "../../models/user/user.model.js";

/* ================================================================
 * SUBMIT / RE-SUBMIT KYC
 * POST /api/bw/bonds/kyc/submit
 *
 * Body:
 *   panNumber        – string
 *   panFileUrl       – string (URL)
 *   addressProofType – "AADHAAR" | "DL" | "VOTER_ID"
 *   addressProofUrl  – string (URL)
 *   bankProofUrl     – string (URL)
 *   dematProofUrl    – string (URL)
 * ================================================================ */
export const submitBwBondKyc = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const {
      panNumber,
      panFileUrl,
      addressProofType,
      addressProofUrl,
      bankProofUrl,
      dematProofUrl,
    } = req.body;

    if (
      !panNumber ||
      !panFileUrl ||
      !addressProofType ||
      !addressProofUrl ||
      !bankProofUrl ||
      !dematProofUrl
    ) {
      return res.status(400).json({
        success: false,
        message:
          "panNumber, panFileUrl, addressProofType, addressProofUrl, bankProofUrl and dematProofUrl are required",
      });
    }

    const validAddressTypes = ["AADHAAR", "DL", "VOTER_ID"];
    if (!validAddressTypes.includes(addressProofType)) {
      return res.status(400).json({
        success: false,
        message: "addressProofType must be AADHAAR, DL, or VOTER_ID",
      });
    }

    const existing = await BwBondKyc.findOne({ userUniqueId: uniqueId });

    if (existing && ["SUBMITTED", "APPROVED"].includes(existing.status)) {
      return res.status(400).json({
        success: false,
        message:
          existing.status === "APPROVED"
            ? "KYC already approved"
            : "KYC already submitted and under review",
      });
    }

    const kycPayload = {
      panNumber: panNumber.toUpperCase(),
      panFileUrl,
      addressProofType,
      addressProofUrl,
      bankProofUrl,
      dematProofUrl,
      status: "SUBMITTED",
      kycRejectionReason: null,
      submittedBy: "USER",
    };

    if (existing) {
      // Re-submit after rejection
      await BwBondKyc.updateOne({ userUniqueId: uniqueId }, { $set: kycPayload });
    } else {
      await BwBondKyc.create({ userUniqueId: uniqueId, ...kycPayload });
    }

    await RegistrationUser.updateOne(
      { uniqueId },
      {
        $set: {
          panNumber: panNumber.toUpperCase(),
          bondKycStatus: "SUBMITTED",
        },
      },
    );

    return res.status(200).json({
      success: true,
      message: "KYC submitted successfully",
      bondKycStatus: "SUBMITTED",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* ================================================================
 * GET KYC STATUS
 * GET /api/bw/bonds/kyc/status
 * ================================================================ */
export const getBwBondKycStatus = async (req, res) => {
  try {
    const { uniqueId } = req.user;

    const user = await RegistrationUser.findOne(
      { uniqueId },
      { _id: 0, bondKycStatus: 1 },
    ).lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const kyc = await BwBondKyc.findOne(
      { userUniqueId: uniqueId },
      { _id: 0, status: 1, kycRejectionReason: 1 },
    ).lean();

    return res.status(200).json({
      success: true,
      bondKycStatus: user.bondKycStatus,
      ...(kyc?.kycRejectionReason && {
        kycRejectionReason: kyc.kycRejectionReason,
      }),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
