import BwBondKyc from "../../models/bonds/bwBondKyc.model.js";
import RegistrationUser from "../../models/user/user.model.js";
import { sendBondKycApprovedEmail } from "../../utils/notifications/email.utils.js";

/* ================================================================
 * LIST ALL KYC SUBMISSIONS
 * GET /api/bw/admin/bonds/kyc?status=SUBMITTED
 * ================================================================ */
export const adminListBwBondKyc = async (req, res) => {
  try {
    const { status } = req.query;

    const filter = {};
    if (status) filter.status = status.toUpperCase();

    const records = await BwBondKyc.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: records.length,
      data: records,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ================================================================
 * GET KYC DETAILS FOR ONE USER
 * GET /api/bw/admin/bonds/kyc/:uniqueId
 * ================================================================ */
export const adminGetBwBondKyc = async (req, res) => {
  try {
    const { uniqueId } = req.params;

    const kyc = await BwBondKyc.findOne({ userUniqueId: uniqueId }).lean();
    if (!kyc) {
      return res.status(404).json({ success: false, message: "KYC not found" });
    }

    const user = await RegistrationUser.findOne(
      { uniqueId },
      { _id: 0, First_name: 1, Last_name: 1, email: 1, phone: 1, bondKycStatus: 1 },
    ).lean();

    return res.status(200).json({
      success: true,
      data: { ...kyc, user },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ================================================================
 * APPROVE / REJECT KYC
 * PUT /api/bw/admin/bonds/kyc/:uniqueId/status
 *
 * Body: { status: "APPROVED" | "REJECTED", kycRejectionReason?: string }
 * ================================================================ */
export const adminUpdateBwBondKycStatus = async (req, res) => {
  try {
    const { uniqueId } = req.params;
    const { status, kycRejectionReason } = req.body;

    if (!["APPROVED", "REJECTED"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "status must be APPROVED or REJECTED",
      });
    }

    if (status === "REJECTED" && !kycRejectionReason) {
      return res.status(400).json({
        success: false,
        message: "kycRejectionReason is required when rejecting",
      });
    }

    const kyc = await BwBondKyc.findOneAndUpdate(
      { userUniqueId: uniqueId },
      {
        $set: {
          status,
          kycRejectionReason: status === "REJECTED" ? kycRejectionReason : null,
        },
      },
      { new: true },
    );

    if (!kyc) {
      return res.status(404).json({ success: false, message: "KYC not found" });
    }

    const user = await RegistrationUser.findOneAndUpdate(
      { uniqueId },
      { $set: { bondKycStatus: status } },
      { new: false },
    ).lean();

    if (status === "APPROVED" && user?.email) {
      const userName = [user.First_name, user.Last_name].filter(Boolean).join(" ");
      sendBondKycApprovedEmail({ to: user.email, userName }).catch((err) =>
        console.error("❌ [BW Bond KYC] Approval email failed:", err.message),
      );
    }

    return res.status(200).json({
      success: true,
      message: `KYC ${status} successfully`,
      bondKycStatus: status,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ================================================================
 * ADMIN MANUALLY SUBMIT KYC FOR A USER
 * POST /api/bw/admin/bonds/kyc/:uniqueId
 *
 * Same body as user submit — useful for offline / assisted onboarding
 * ================================================================ */
export const adminAddBwBondKyc = async (req, res) => {
  try {
    const { uniqueId } = req.params;
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
        message: "All KYC document fields are required",
      });
    }

    const user = await RegistrationUser.findOne({ uniqueId });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const existing = await BwBondKyc.findOne({ userUniqueId: uniqueId });

    const kycPayload = {
      panNumber: panNumber.toUpperCase(),
      panFileUrl,
      addressProofType,
      addressProofUrl,
      bankProofUrl,
      dematProofUrl,
      status: "SUBMITTED",
      kycRejectionReason: null,
      submittedBy: "ADMIN",
    };

    if (existing) {
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

    return res.status(201).json({
      success: true,
      message: "KYC submitted by admin",
      bondKycStatus: "SUBMITTED",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ================================================================
 * DELETE KYC & RESET USER STATUS
 * DELETE /api/bw/admin/bonds/kyc/:uniqueId
 * ================================================================ */
export const adminDeleteBwBondKyc = async (req, res) => {
  try {
    const { uniqueId } = req.params;

    const kyc = await BwBondKyc.findOne({ userUniqueId: uniqueId });
    if (!kyc) {
      return res.status(404).json({ success: false, message: "KYC not found" });
    }

    await BwBondKyc.deleteOne({ userUniqueId: uniqueId });

    await RegistrationUser.updateOne(
      { uniqueId },
      {
        $set: { bondKycStatus: "PENDING" },
        $unset: { panNumber: "" },
      },
    );

    return res.status(200).json({
      success: true,
      message: "KYC deleted and user status reset to PENDING",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
