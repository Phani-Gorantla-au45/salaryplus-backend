// import SBregister from "../../models/bonds/SBregister.model.js";
import { getBondDetails } from "../../controllers/bonds/bondDetailsfunction.js";

export const getBondDetailsController = async (req, res) => {
  try {
    // 🔐 uniqueId comes from JWT middleware
    const { uniqueId } = req.user;

    if (!uniqueId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // 1️⃣ Fetch PAN from SBregister
    const user = await SBregister.findOne(
      { uniqueId },
      { _id: 0, panNumber: 1 },
    ).lean();

    if (!user || !user.panNumber) {
      return res.status(400).json({
        success: false,
        message: "PAN not found. Please complete KYC.",
      });
    }

    const pan = user.panNumber;

    // ✅ Optional log
    console.log("Fetching bond details for PAN:", pan);

    // 2️⃣ Get bond details using PAN
    const bondDetails = await getBondDetails(pan);

    if (bondDetails.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No bond investments found",
      });
    }

    return res.status(200).json({
      success: true,
      data: bondDetails,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
