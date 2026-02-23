import KYC from "../../../models/bonds/SBkyc.model.js";
import SBregister from "../../../models/bonds/SBregister.model.js";

export const submitKycCommon = async ({
  uniqueId,
  panNumber,
  panFileUrl,
  addressProofUrl,
  dematProofUrl,
  bankProofUrl,
  submittedBy,
}) => {
  if (
    !panNumber ||
    !panFileUrl ||
    !addressProofUrl ||
    !dematProofUrl ||
    !bankProofUrl
  ) {
    throw new Error("All KYC details are required");
  }

  const existingKyc = await KYC.findOne({ userUniqueId: uniqueId });
  if (existingKyc) {
    throw new Error("KYC already submitted");
  }

  // ✅ ALWAYS SUBMITTED
  await KYC.create({
    userUniqueId: uniqueId,
    panNumber,
    panFileUrl,
    addressProofUrl,
    dematProofUrl,
    bankProofUrl,
    status: "SUBMITTED",
    submittedBy,
  });

  // ✅ MASTER STATUS ALSO SUBMITTED
  await SBregister.updateOne(
    { uniqueId },
    {
      $set: {
        panNumber,
        kycStatus: "SUBMITTED",
      },
    },
  );
};
