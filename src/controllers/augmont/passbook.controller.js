import axios from "axios";
import RegistrationUser from "../../models/registration.model.js";
import Passbook from "../../models/passbook.model.js";

export const getPassbook = async (req, res) => {
  try {
    if (!req.user?.uniqueId)
      return res.status(401).json({ message: "Unauthorized" });

    // 🔹 FETCH USER
    const user = await RegistrationUser.findOne({
      uniqueId: req.user.uniqueId,
    });
    if (!user?.uniqueId)
      return res.status(400).json({ message: "User not linked to Augmont" });

    console.log("📒 Fetching passbook for:", user.uniqueId);

    // 🔥 CALL AUGMONT PASSBOOK API
    const response = await axios.get(
      `${process.env.AUG_URL}/merchant/v1/users/${user.uniqueId}/passbook`,
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
      { uniqueId: user.uniqueId },
      {
        uniqueId: user.uniqueId,
        goldBalance,
        silverBalance,
      },
      { upsert: true, new: true },
    );

    res.json({
      message: "Passbook fetched successfully",
      passbook,
    });
  } catch (err) {
    console.error("❌ PASSBOOK ERROR:", err.response?.data || err.message);
    res.status(500).json({
      message: "Failed to fetch passbook",
      error: err.response?.data || err.message,
    });
  }
};
