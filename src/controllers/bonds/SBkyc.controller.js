// import KYC from "../../models/bonds/SBkyc.model.js";
// import SBregister from "../../models/bonds/SBregister.model.js";

// export const submitKyc = async (req, res) => {
//   try {
//     const {
//       panNumber,
//       panFileUrl,
//       addressProofUrl,
//       dematProofUrl,
//       bankProofUrl,
//     } = req.body;

//     const { uniqueId } = req.user;

//     if (
//       !panNumber ||
//       !panFileUrl ||
//       !addressProofUrl ||
//       !dematProofUrl ||
//       !bankProofUrl
//     ) {
//       return res.status(400).json({
//         success: false,
//         message: "All KYC details and document links are required",
//       });
//     }

//     // prevent duplicate KYC
//     const existingKyc = await KYC.findOne({ userUniqueId: uniqueId });
//     if (existingKyc) {
//       return res.status(400).json({
//         success: false,
//         message: "KYC already submitted",
//       });
//     }

//     await KYC.create({
//       userUniqueId: uniqueId,
//       panNumber,
//       panFileUrl,
//       addressProofUrl,
//       dematProofUrl,
//       bankProofUrl,
//     });

//     // 🔥 IMPORTANT: update registration collection
//     await SBregister.updateOne(
//       { uniqueId },
//       {
//         $set: {
//           panNumber, // ✅ ADD THIS
//           kycStatus: "SUBMITTED",
//         },
//       },
//     );
//     return res.status(200).json({
//       success: true,
//       message: "KYC submitted successfully",
//       kycStatus: "SUBMITTED",
//     });
//   } catch (error) {
//     return res.status(500).json({
//       success: false,
//       message: "KYC submission failed",
//     });
//   }
// };
// export const fetchKycStatus = async (req, res) => {
//   try {
//     const { uniqueId } = req.user;

//     const user = await SBregister.findOne(
//       { uniqueId },
//       { _id: 0, kycStatus: 1 },
//     ).lean();

//     if (!user) {
//       return res.status(404).json({
//         success: false,
//         message: "User not found",
//       });
//     }

//     return res.status(200).json({
//       success: true,
//       kycStatus: user.kycStatus,
//     });
//   } catch (error) {
//     return res.status(500).json({
//       success: false,
//       message: "Failed to fetch KYC status",
//     });
//   }
// };

// /* ================= UPDATE KYC STATUS (ADMIN) ================= */

// export const updateKycStatus = async (req, res) => {
//   try {
//     const { uniqueId } = req.params;
//     const { status, kycRejectionReason } = req.body;

//     if (!uniqueId || !status) {
//       return res.status(400).json({
//         success: false,
//         message: "uniqueId and status are required",
//       });
//     }

//     if (!["APPROVED", "REJECTED"].includes(status)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid KYC status",
//       });
//     }

//     // 1️⃣ UPDATE KYC COLLECTION
//     const updatedKyc = await KYC.findOneAndUpdate(
//       { userUniqueId: uniqueId },
//       {
//         $set: {
//           status,
//           ...(status === "REJECTED" && { kycRejectionReason }),
//         },
//       },
//       { new: true },
//     );

//     if (!updatedKyc) {
//       return res.status(404).json({
//         success: false,
//         message: "KYC record not found",
//       });
//     }

//     // 2️⃣ SYNC USER MASTER
//     await SBregister.updateOne({ uniqueId }, { $set: { kycStatus: status } });

//     return res.status(200).json({
//       success: true,
//       message: `KYC ${status} successfully`,
//       kycStatus: status,
//     });
//   } catch (error) {
//     console.error("UPDATE KYC STATUS ERROR 👉", error);

//     return res.status(500).json({
//       success: false,
//       message: error.message,
//     });
//   }
// };

import { submitKycCommon } from "../../controllers/bonds/utils/kyc.function.js";

export const submitKyc = async (req, res) => {
  try {
    const { uniqueId } = req.user;

    await submitKycCommon({
      uniqueId,
      ...req.body,
      submittedBy: "USER",
    });

    return res.status(200).json({
      success: true,
      message: "KYC submitted successfully",
      kycStatus: "SUBMITTED",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
export const fetchKycStatus = async (req, res) => {
  try {
    const { uniqueId } = req.user;

    const user = await SBregister.findOne(
      { uniqueId },
      { _id: 0, kycStatus: 1 },
    ).lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      kycStatus: user.kycStatus,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch KYC status",
    });
  }
};
