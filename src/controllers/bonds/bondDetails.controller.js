import { getBondDetails } from "../../controllers/bonds/bondDetailsfunction.js";

export const getBondDetailsController = async (req, res) => {
  try {
    const { pan } = req.body;

    if (!pan) {
      return res.status(400).json({
        success: false,
        message: "PAN is required in request body",
      });
    }

    // ✅ Optional: log / audit
    console.log("Fetching bond details for:", {
      //uniqueId,
      pan,
    });

    const bondDetails = await getBondDetails(pan);

    if (bondDetails.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No bond investments found for this PAN",
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
