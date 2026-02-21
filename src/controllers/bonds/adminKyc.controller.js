import { submitKycCommon } from "../../controllers/bonds/utils/kyc.function.js";
import KYC from "../../models/bonds/SBkyc.model.js";
import SBregister from "../../models/bonds/SBregister.model.js";

export const adminAddKyc = async (req, res) => {
  try {
    const { uniqueId } = req.params;

    const user = await SBregister.findOne({ uniqueId });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Investor not found",
      });
    }

    await submitKycCommon({
      uniqueId,
      ...req.body,
      submittedBy: "ADMIN",
    });

    return res.status(201).json({
      success: true,
      message: "KYC added and approved by admin",
      kycStatus: "SUBMITTED",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

//edit
export const adminEditKyc = async (req, res) => {
  try {
    const { uniqueId } = req.params;

    const kyc = await KYC.findOne({ userUniqueId: uniqueId });
    if (!kyc) {
      return res.status(404).json({
        success: false,
        message: "KYC not found",
      });
    }

    Object.assign(kyc, req.body);
    await kyc.save();

    if (req.body.panNumber) {
      await SBregister.updateOne(
        { uniqueId },
        { $set: { panNumber: req.body.panNumber } },
      );
    }

    return res.status(200).json({
      success: true,
      message: "KYC updated successfully",
      data: kyc,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to update KYC",
    });
  }
};

//delete
export const adminDeleteKyc = async (req, res) => {
  try {
    const { uniqueId } = req.params;

    const kyc = await KYC.findOne({ userUniqueId: uniqueId });
    if (!kyc) {
      return res.status(404).json({
        success: false,
        message: "KYC not found",
      });
    }

    kyc.status = "DELETED";
    await kyc.save();

    await SBregister.updateOne(
      { uniqueId },
      { $set: { kycStatus: "NOT_SUBMITTED" } },
    );

    return res.status(200).json({
      success: true,
      message: "KYC deleted successfully",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to delete KYC",
    });
  }
};
//fetch
export const adminGetKycStatus = async (req, res) => {
  try {
    const { uniqueId } = req.params;

    const user = await SBregister.findOne(
      { uniqueId },
      { _id: 0, uniqueId: 1, fullName: 1, kycStatus: 1 },
    ).lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Investor not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch KYC status",
    });
  }
};
//update status
export const updateKycStatus = async (req, res) => {
  try {
    const { uniqueId } = req.params;
    const { status, kycRejectionReason } = req.body;

    if (!uniqueId || !status) {
      return res.status(400).json({
        success: false,
        message: "uniqueId and status are required",
      });
    }

    if (!["APPROVED", "REJECTED"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid KYC status",
      });
    }

    // 1️⃣ UPDATE KYC COLLECTION
    const updatePayload = {
      status,
    };

    if (status === "REJECTED") {
      updatePayload.kycRejectionReason = kycRejectionReason;
    } else {
      updatePayload.kycRejectionReason = null; // 🔥 IMPORTANT
    }

    const updatedKyc = await KYC.findOneAndUpdate(
      { userUniqueId: uniqueId },
      { $set: updatePayload },
      { new: true },
    );

    if (!updatedKyc) {
      return res.status(404).json({
        success: false,
        message: "KYC record not found",
      });
    }

    // 2️⃣ SYNC MASTER TABLE (SOURCE OF TRUTH)
    await SBregister.updateOne({ uniqueId }, { $set: { kycStatus: status } });

    return res.status(200).json({
      success: true,
      message: `KYC ${status} successfully`,
      kycStatus: status,
    });
  } catch (error) {
    console.error("UPDATE KYC STATUS ERROR 👉", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
