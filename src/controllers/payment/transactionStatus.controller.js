// controllers/metalStatus.controller.js
import axios from "axios";
import generateJWS from "../../utils/payment/generateJWS.js";
import MetalTxn from "../../models/gold/metalTransaction.model.js";
import { buyMetalFromAugmont } from "../../utils/gold/buy.utils.js";
import Rate from "../../models/gold/rate.model.js";
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_TIME_MS = 1 * 60 * 1000;

/* ---------------- INTERNAL: Poll Juspay ---------------- */
const pollJuspayStatus = async (merchantRequestId) => {
  const payload = {
    merchantRequestId,
    transactionType: "MERCHANT_CREDITED_VIA_PAY",
    iat: Date.now().toString(),
    udfParameters: "{}",
  };

  const jws = await generateJWS(payload, process.env.JUSPAY_KID);

  const response = await axios.post(
    `${process.env.JUSPAY_HOST}/merchants/transactions/status360`,
    {
      signature: jws.signature,
      payload: jws.payload,
      protected: jws.protected,
    },
    {
      headers: {
        "Content-Type": "application/json",
        "x-merchant-id": process.env.JUSPAY_MERCHANTID,
        "x-merchant-channel-id": process.env.JUSPAY_CHANNELID,
        "x-api-version": "3",
        "x-timestamp": Date.now().toString(),
        "jpupi-routing-id": merchantRequestId,
      },
    },
  );

  return response.data;
};

/* ---------------- PUBLIC API ---------------- */
export const getTransactionStatus360 = async (req, res) => {
  try {
    const { merchantRequestId } = req.body;

    if (!merchantRequestId)
      return res.status(400).json({ message: "merchantRequestId required" });

    const txn = await MetalTxn.findOne({
      merchantTransactionId: merchantRequestId,
    });

    if (!txn) return res.status(404).json({ message: "Transaction not found" });

    /* ---------------- PAYMENT INITIATED ---------------- */
    if (txn.status === "CREATED") {
      txn.status = "PAYMENT_INITIATED";
      txn.providerStatus = "USER_CLICKED_PAY";
      txn.updatedAt = new Date();
      await txn.save();
    }

    const startTime = Date.now();
    let lastResponse;

    /* ---------------- POLLING ---------------- */
    while (Date.now() - startTime < MAX_POLL_TIME_MS) {
      const latestTxn = await MetalTxn.findById(txn._id).select(
        "status providerStatus",
      );
      if (latestTxn?.status === "FAILED") {
        return res.json({
          success: true,
          message: "Polling stopped. Transaction already FAILED.",
          status: latestTxn.status,
          providerStatus: latestTxn.providerStatus,
        });
      }
      lastResponse = await pollJuspayStatus(merchantRequestId);
      console.log(lastResponse);
      // ✅ DOC-CORRECT FIELDS
      const responseCode = lastResponse?.responseCode;
      const gatewayStatus = lastResponse?.payload?.gatewayResponseStatus;

      /* ---------- SUCCESS ---------- */
      if (responseCode === "SUCCESS" && gatewayStatus === "SUCCESS") {
        txn.status = "SUCCESS";
        txn.providerStatus = "SUCCESS";
        txn.updatedAt = new Date();
        await txn.save();

        // 🔥 Allocate gold ONLY after payment success
        const updatedTxn = await buyMetalFromAugmont(txn._id);

        return res.json({
          success: true,
          message: "Payment successful, gold allocated",
          status: updatedTxn.status,
          txn: updatedTxn,
        });
      }

      /* ---------- FAILURE CASES (FROM DOC) ---------- */
      if (
        gatewayStatus === "FAILURE" ||
        responseCode === "REQUEST_EXPIRED" ||
        responseCode === "REQUEST_NOT_FOUND" ||
        responseCode === "DROPOUT"
      ) {
        txn.status = "FAILED";
        txn.providerStatus =
          gatewayStatus === "FAILURE"
            ? lastResponse.payload.gatewayResponseMessage
            : responseCode;
        txn.updatedAt = new Date();
        await txn.save();

        return res.json({
          success: true,
          message: "Payment failed",
          status: txn.status,
          providerStatus: txn.providerStatus,
        });
      }

      /* ---------- STILL PENDING ---------- */
      txn.status = "PENDING";
      txn.providerStatus = gatewayStatus || responseCode || "PENDING";
      txn.updatedAt = new Date();
      await txn.save();

      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    /* ---------------- TIMEOUT ---------------- */
    txn.status = "FAILED";
    txn.providerStatus = "TIMEOUT_EXPIRED";
    txn.updatedAt = new Date();
    await txn.save();

    return res.json({
      success: true,
      message: "Payment timeout",
      status: txn.status,
      providerStatus: txn.providerStatus,
    });
  } catch (err) {
    console.error("❌ STATUS 360 ERROR:", err.response?.data || err.message);
    res.status(500).json({ message: "Status check failed" });
  }
};
