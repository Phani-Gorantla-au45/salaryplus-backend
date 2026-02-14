import Bond from "../../models/bond.model.js";

/* ---------------- CREATE BOND LISTING ---------------- */
export const createBond = async (req, res) => {
  try {
    const {
      bondLaunchId,
      bondName,
      isin,
      faceValue,
      unitsAvailable,
      ytm,
      couponRate,
      interestPayoutFrequency,
      principalPayoutFrequency,
      maturityDate,
      couponBasis,
      security,
      guaranteeType,
      repaymentPriority,
      rating,
      ratingAgency,
      ratingDate,
      issuerName,
      debentureTrustee,
    } = req.body;

    // 🔍 Check duplicate ISIN
    const existingBond = await Bond.findOne({ isin });
    if (existingBond) {
      return res.status(409).json({
        success: false,
        message: "Bond with this ISIN already exists",
      });
    }

    const bond = await Bond.create({
      bondLaunchId,
      bondName,
      isin,
      faceValue,
      unitsAvailable,
      ytm,
      couponRate,
      interestPayoutFrequency,
      principalPayoutFrequency,
      maturityDate,
      couponBasis,
      security,
      guaranteeType,
      repaymentPriority,
      rating,
      ratingAgency,
      ratingDate,
      issuerName,
      debentureTrustee,
    });

    res.status(201).json({
      success: true,
      message: "Bond listing created successfully",
      data: bond,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
