// import KYC from "../../../models/bonds/SBkyc.model.js";
// import SBregister from "../../../models/bonds/SBregister.model.js";

// export const submitKycCommon = async ({
//   uniqueId,
//   panNumber,
//   panFileUrl,
//   addressProofUrl,
//   dematProofUrl,
//   bankProofUrl,
//   submittedBy,
// }) => {
//   if (
//     !panNumber ||
//     !panFileUrl ||
//     !addressProofUrl ||
//     !dematProofUrl ||
//     !bankProofUrl
//   ) {
//     throw new Error("All KYC details are required");
//   }

//   const existingKyc = await KYC.findOne({ userUniqueId: uniqueId });
//   if (existingKyc) {
//     throw new Error("KYC already submitted");
//   }

//   // ✅ ALWAYS SUBMITTED
//   await KYC.create({
//     userUniqueId: uniqueId,
//     panNumber,
//     panFileUrl,
//     addressProofUrl,
//     dematProofUrl,
//     bankProofUrl,
//     status: "SUBMITTED",
//     submittedBy,
//   });

//   // ✅ MASTER STATUS ALSO SUBMITTED
//   await SBregister.updateOne(
//     { uniqueId },
//     {
//       $set: {
//         panNumber,
//         kycStatus: "SUBMITTED",
//       },
//     },
//   );
// };

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
  /* ---------- VALIDATION ---------- */
  if (
    !panNumber ||
    !panFileUrl ||
    !addressProofUrl ||
    !dematProofUrl ||
    !bankProofUrl
  ) {
    throw new Error("All KYC details are required");
  }

  /* ---------- CHECK EXISTING KYC ---------- */
  const existingKyc = await KYC.findOne({ userUniqueId: uniqueId });

  /* ---------- BLOCK IF ALREADY SUBMITTED / APPROVED ---------- */
  if (
    existingKyc &&
    (existingKyc.status === "SUBMITTED" || existingKyc.status === "APPROVED")
  ) {
    throw new Error("KYC already submitted");
  }

  /* ---------- CREATE OR UPDATE KYC ---------- */
  if (existingKyc) {
    // ✅ Re-submit only if REJECTED
    await KYC.updateOne(
      { userUniqueId: uniqueId },
      {
        $set: {
          panNumber,
          panFileUrl,
          addressProofUrl,
          dematProofUrl,
          bankProofUrl,
          status: "SUBMITTED",
          submittedBy,
        },
      },
    );
  } else {
    // ✅ First-time submit
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
  }

  /* ---------- UPDATE MASTER REGISTER ---------- */
  await SBregister.updateOne(
    { uniqueId },
    {
      $set: {
        panNumber,
        kycStatus: "SUBMITTED",
      },
    },
  );

  return true;
};
