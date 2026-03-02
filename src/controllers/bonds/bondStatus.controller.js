import BondTransaction from "../../models/bonds/bondTransaction.model.js";

export const adminGetAllBondTransactions = async (req, res) => {
  console.log("inside getalltrans");
  try {
    const { page = 1, limit = 10, uniqueId, isin, status } = req.query;

    const filter = {};

    if (uniqueId) filter.uniqueId = uniqueId;
    if (isin) filter.isin = isin.trim().toUpperCase();
    if (status) filter.status = status.toUpperCase();

    const skip = (Number(page) - 1) * Number(limit);

    const total = await BondTransaction.countDocuments(filter);

    const transactions = await BondTransaction.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    return res.status(200).json({
      statusCode: 200,
      message: "Bond transactions fetched successfully",
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit),
      },
      result: transactions,
    });
  } catch (error) {
    return res.status(500).json({
      statusCode: 500,
      message: error.message,
    });
  }
};

/* ---------- UPDATE BOND TRANSACTION STATUS (ADMIN) ---------- */
export const updateBondTransactionStatus = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { status } = req.body;

    /* ---------- VALIDATION ---------- */
    if (!transactionId || !status) {
      return res.status(400).json({
        statusCode: 400,
        message: "transactionId and status are required",
      });
    }

    const allowedStatuses = ["PENDING", "SUCCESS", "FAILED"];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        statusCode: 400,
        message: "Invalid status value",
      });
    }

    /* ---------- UPDATE ---------- */
    const transaction = await BondTransaction.findOneAndUpdate(
      { transactionId },
      {
        status,
        statusUpdatedAt: new Date(),
      },
      { new: true },
    );

    if (!transaction) {
      return res.status(404).json({
        statusCode: 404,
        message: "Transaction not found",
      });
    }

    return res.status(200).json({
      statusCode: 200,
      message: "Transaction status updated successfully",
      result: {
        transactionId: transaction.transactionId,
        status: transaction.status,
        statusUpdatedAt: transaction.statusUpdatedAt,
        updatedAt: transaction.updatedAt,
      },
    });
  } catch (error) {
    return res.status(500).json({
      statusCode: 500,
      message: error.message,
    });
  }
};
