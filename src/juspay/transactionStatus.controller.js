// import axios from "axios";
// import generateJWS from "../juspay/generateJWS.js";
// import MetalTxn from "../models/metalTransaction.model.js";

// /* ---------------- CONFIG ---------------- */
// const POLL_INTERVAL_MS = 5000; // 5 seconds
// const MAX_POLL_TIME_MS = 1; // 3 minutes

// export const getTransactionStatus360 = async (req, res) => {
//   try {
//     /* ---------------- INPUT ---------------- */
//     const { merchantRequestId } = req.body;

//     if (!merchantRequestId) {
//       return res.status(400).json({
//         message: "merchantRequestId is required",
//       });
//     }

//     /* ---------------- FETCH TXN ---------------- */
//     const txn = await MetalTxn.findOne({
//       merchantTransactionId: merchantRequestId,
//     });

//     if (!txn) {
//       return res.status(404).json({
//         message: "Transaction not found",
//       });
//     }

//     /* ---------------- MARK PAYMENT INITIATED ---------------- */
//     if (txn.status === "CREATED") {
//       txn.status = "PAYMENT_INITIATED";
//       txn.providerStatus = "USER_CLICKED_PAY";
//       txn.updatedAt = new Date();
//       await txn.save();
//     }

//     const startTime = Date.now();
//     let finalStatus = null;
//     let providerStatus = null;
//     let lastJuspayResponse = null;

//     /* ---------------- POLLING LOOP ---------------- */
//     while (Date.now() - startTime < MAX_POLL_TIME_MS) {
//       const payload = {
//         merchantRequestId,
//         transactionType: "MERCHANT_CREDITED_VIA_PAY", // ✅ DOC-CORRECT
//         iat: Date.now().toString(),
//         udfParameters: "{}",
//       };

//       const jws = await generateJWS(payload, process.env.JUSPAY_KID);

//       const response = await axios.post(
//         `${process.env.JUSPAY_HOST}/merchants/transactions/status360`,
//         {
//           signature: jws.signature,
//           payload: jws.payload,
//           protected: jws.protected,
//         },
//         {
//           headers: {
//             "Content-Type": "application/json",
//             "x-merchant-id": process.env.JUSPAY_MERCHANTID,
//             "x-merchant-channel-id": process.env.JUSPAY_CHANNELID,
//             "x-api-version": "3",
//             "x-timestamp": Date.now().toString(),
//             "jpupi-routing-id": merchantRequestId,
//           },
//         },
//       );

//       lastJuspayResponse = response.data;

//       const responseCode = response.data?.responseCode;
//       const txnStatus = response.data?.result?.transactionStatus;

//       /* ---------------- STATUS HANDLING ---------------- */

//       // ✅ Payment success
//       if (txnStatus === "SUCCESS") {
//         finalStatus = "SUCCESS";
//         providerStatus = "SUCCESS";
//         break;
//       }

//       // ❌ Known failure cases (from docs)
//       if (
//         responseCode === "REQUEST_EXPIRED" ||
//         responseCode === "REQUEST_NOT_FOUND" ||
//         responseCode === "DROPOUT" ||
//         txnStatus === "FAILED"
//       ) {
//         finalStatus = "FAILED";
//         providerStatus = responseCode || txnStatus;
//         break;
//       }

//       // ⏳ Still pending
//       txn.status = "PENDING";
//       txn.providerStatus = txnStatus || "PENDING";
//       txn.updatedAt = new Date();
//       await txn.save();

//       // wait before next poll
//       await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
//     }

//     /* ---------------- TIMEOUT HANDLING ---------------- */
//     if (!finalStatus) {
//       finalStatus = "FAILED";
//       providerStatus = "TIMEOUT_EXPIRED";
//     }

//     txn.status = finalStatus;
//     txn.providerStatus = providerStatus;
//     txn.updatedAt = new Date();
//     await txn.save();

//     /* ---------------- RESPONSE ---------------- */
//     res.json({
//       success: true,
//       message: "Transaction verification completed",
//       merchantRequestId,
//       status: txn.status,
//       providerStatus: txn.providerStatus,
//       juspayResponse: lastJuspayResponse,
//     });
//   } catch (err) {
//     console.error(
//       "❌ STATUS 360 POLLING ERROR:",
//       err.response?.data || err.message,
//     );

//     res.status(500).json({
//       message: "Failed to verify transaction status",
//       error: err.response?.data || err.message,
//     });
//   }
// };
// controllers/metalStatus.controller.js
import axios from "axios";
import generateJWS from "../juspay/generateJWS.js";
import MetalTxn from "../models/augmont/metalTransaction.model.js";
import { buyMetalFromAugmont } from "../controllers/augmont/utils/buyfunction.js";
import Rate from "../models/augmont/rateModel.js";
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

/* ---------------- INTERNAL: Allocate Gold ---------------- */
// const allocateGoldAfterPayment = async (txn) => {
//   // Idempotency
//   if (txn.augmontOrderId) return txn;

//   // 🔥 FETCH FRESH RATE (MANDATORY)
//   const rate = await Rate.findOne().sort({ updatedAt: -1 });
//   if (!rate) throw new Error("Rates not available");

//   txn.lockPrice = txn.metalType === "gold" ? rate.gBuy : rate.sBuy;
//   txn.blockId = rate.blockId;

//   txn.updatedAt = new Date();
//   await txn.save();

//   return await buyMetalFromAugmont(txn._id);
// };

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
