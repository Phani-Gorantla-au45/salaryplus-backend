// controllers/paymentFailure.controller.js
import MetalTxn from "../models/augmont/metalTransaction.model.js";

export const markPaymentFailed = async (req, res) => {
  try {
    /* ------------ AUTH ------------ */
    if (!req.user?.uniqueId) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    /* ------------ INPUT ------------ */
    const { merchantTransactionId } = req.body;

    if (!merchantTransactionId) {
      return res.status(400).json({
        message: "merchantTransactionId is required",
      });
    }

    /* ------------ FETCH TXN ------------ */
    const txn = await MetalTxn.findOne({
      merchantTransactionId,
      uniqueId: req.user.uniqueId, // 🔐 ownership check
    });

    if (!txn) {
      return res.status(404).json({
        message: "Transaction not found",
      });
    }

    /* ------------ IDEMPOTENCY ------------ */
    if (txn.status === "FAILED") {
      return res.json({
        success: true,
        message: "Transaction already marked as FAILED",
        status: txn.status,
      });
    }

    /* ------------ UPDATE STATUS ------------ */
    txn.status = "FAILED";
    txn.providerStatus = "PAYMENT_FAILED";
    txn.updatedAt = new Date();

    await txn.save();

    /* ------------ RESPONSE ------------ */
    return res.json({
      success: true,
      message: "Payment marked as failed",
      merchantTransactionId,
      status: txn.status,
      providerStatus: txn.providerStatus,
    });
  } catch (err) {
    console.error("❌ PAYMENT FAILED HANDLER ERROR:", err.message);
    return res.status(500).json({
      message: "Failed to update payment status",
    });
  }
};
