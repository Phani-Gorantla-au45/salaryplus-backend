import BondTransaction from "../../models/bonds/bondTransaction.model.js";
import BondListing from "../../models/bonds/bond.model.js";

/* ---------- BOOK BOND API ---------- */
export const bookBond = async (req, res) => {
  try {
    const { isin, units, amount } = req.body;

    /* ---------- VALIDATION ---------- */
    if (!isin || !units || !amount) {
      return res.status(400).json({
        statusCode: 400,
        message: "isin, units and amount are required",
      });
    }

    /* ---------- USER FROM TOKEN ---------- */
    const uniqueId = req.user?.uniqueId;

    if (!uniqueId) {
      return res.status(401).json({
        statusCode: 401,
        message: "Unauthorized user",
      });
    }

    /* ---------- CHECK BOND LISTING (INVENTORY) ---------- */
    const bond = await BondListing.findOne({
      isin: isin.trim().toUpperCase(),
      status: "ACTIVE",
    });

    if (!bond) {
      return res.status(404).json({
        statusCode: 404,
        message: "Bond not available",
      });
    }

    /* ---------- CHECK AVAILABLE UNITS ---------- */
    if (bond.availableUnits < units) {
      return res.status(400).json({
        statusCode: 400,
        message: "Insufficient bond availability",
      });
    }

    /* ---------- GENERATE TRANSACTION ID ---------- */
    const lastTransaction = await BondTransaction.findOne({})
      .sort({ createdAt: -1 })
      .select("transactionId")
      .lean();

    let transactionId = "001";

    if (lastTransaction?.transactionId) {
      const lastNumber = Number(lastTransaction.transactionId);
      transactionId = String(lastNumber + 1).padStart(3, "0");
    }

    /* ---------- CREATE TRANSACTION ---------- */
    const transaction = await BondTransaction.create({
      transactionId,
      uniqueId,
      isin: bond.isin,
      units,
      amount,
      status: "PENDING",
    });

    /* ---------- REDUCE AVAILABLE UNITS (INVENTORY) ---------- */
    await BondListing.updateOne(
      { isin: bond.isin },
      { $inc: { availableUnits: -units } },
    );

    return res.status(201).json({
      statusCode: 201,
      message: "Bond booked successfully",
      result: {
        transactionId: transaction.transactionId,
        status: transaction.status,
      },
    });
  } catch (error) {
    return res.status(500).json({
      statusCode: 500,
      message: error.message,
    });
  }
};
