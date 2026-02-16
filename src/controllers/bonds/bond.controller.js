import Bond from "../../models/bonds/bond.model.js";

/* ---------------- CREATE BOND LISTING (ADMIN) ---------------- */
export const createBond = async (req, res) => {
  try {
    // 1️⃣ Get latest bondLaunchId from DB
    const lastBond = await Bond.findOne({})
      .sort({ bondLaunchId: -1 })
      .select("bondLaunchId");

    // 2️⃣ Decide next number
    let nextNumber = 1;

    if (lastBond?.bondLaunchId) {
      nextNumber = Number(lastBond.bondLaunchId) + 1;
    }

    // 3️⃣ Convert to fixed format: 0001, 0002, ...
    const bondLaunchId = String(nextNumber).padStart(4, "0");

    // 4️⃣ FORCE override (client value ignored)
    delete req.body.bondLaunchId;

    const bond = await Bond.create({
      ...req.body,
      bondLaunchId,
    });

    return res.status(201).json({
      success: true,
      message: "Bond listing created successfully",
      data: bond,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Bond with same ISIN already exists",
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
