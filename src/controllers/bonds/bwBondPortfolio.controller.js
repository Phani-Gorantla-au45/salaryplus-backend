import RegistrationUser from "../../models/user/user.model.js";
import { getBondDetails } from "../../utils/bonds/bondDetails.utils.js";

/* ================================================================
 * BW USER — BOND PORTFOLIO
 * GET /api/bw/bonds/portfolio
 * ================================================================ */
export const getBwBondPortfolio = async (req, res) => {
  try {
    const { uniqueId } = req.user;

    const user = await RegistrationUser.findOne(
      { uniqueId },
      { _id: 0, panNumber: 1, bondKycStatus: 1 },
    ).lean();

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (user.bondKycStatus !== "APPROVED") {
      return res.status(403).json({
        success: false,
        message: "Bond KYC not approved yet",
        bondKycStatus: user.bondKycStatus || "PENDING",
      });
    }

    if (!user.panNumber) {
      return res.status(400).json({
        success: false,
        message: "PAN not found. Please complete Bond KYC.",
      });
    }

    const portfolio = await getBondDetails(user.panNumber);

    if (!portfolio.length) {
      return res.status(200).json({
        success: true,
        message: "No bond investments found",
        data: [],
      });
    }

    return res.status(200).json({ success: true, data: portfolio });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
