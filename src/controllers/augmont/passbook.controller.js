import RegistrationUser from "../../models/registration/registration.model.js";
import { fetchPassbookFromAugmont } from "../augmont/utils/Passbookfunction.js";
export const getPassbook = async (req, res) => {
  try {
    if (!req.user?.uniqueId)
      return res.status(401).json({ message: "Unauthorized" });

    const user = await RegistrationUser.findOne({
      uniqueId: req.user.uniqueId,
    });

    if (!user?.uniqueId)
      return res.status(400).json({ message: "User not linked to Augmont" });

    const passbook = await fetchPassbookFromAugmont(user.uniqueId);

    res.json({
      statusCode: 200,
      message: "Metal balance fetched successfully",
      metalBalance: {
        goldBalance: Number(passbook.goldBalance.toFixed(4)),
        silverBalance: Number(passbook.silverBalance.toFixed(4)),
      },
    });
  } catch (err) {
    console.error("❌ METAL BALANCE ERROR:", err.message);
    res.status(500).json({
      message: "Failed to fetch metal balance",
    });
  }
};
