import axios from "axios";
import Passbook from "../../../models/passbook.model.js";

/* ======================================================
   GET PASSBOOK FROM AUGMONT
====================================================== */
export const fetchPassbookFromAugmont = async (uniqueId) => {
  const response = await axios.get(
    `${process.env.AUG_URL}/merchant/v1/users/${uniqueId}/passbook`,
    {
      headers: {
        Authorization: `Bearer ${process.env.AUGMONT_TOKEN}`,
        Accept: "application/json",
      },
    },
  );

  const data = response.data.result.data;

  const goldBalance = Number(data.goldGrms);
  const silverBalance = Number(data.silverGrms);

  // 💾 SAVE / UPDATE PASSBOOK
  const passbook = await Passbook.findOneAndUpdate(
    { uniqueId },
    {
      uniqueId,
      goldBalance,
      silverBalance,
    },
    { upsert: true, new: true },
  );

  return passbook;
};
