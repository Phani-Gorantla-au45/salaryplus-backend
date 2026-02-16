// import axios from "axios";
// import generateJWS from "../juspay/generateJWS.js";

// export const getTransactionStatus360 = async (req, res) => {
//   try {
//     /* ---------------- INPUT ---------------- */
//     const { merchantRequestId, transactionType } = req.body;

//     if (!merchantRequestId || !transactionType) {
//       return res.status(400).json({
//         message: "merchantRequestId and transactionType are required",
//       });
//     }

//     /* ---------------- PAYLOAD ---------------- */
//     const payload = {
//       merchantRequestId,
//       transactionType,
//       iat: Date.now().toString(),
//       udfParameters: "{}",
//     };

//     /* ---------------- JWS ---------------- */
//     const jws = await generateJWS(payload, process.env.JUSPAY_KID);

//     /* ---------------- CALL JUSPAY ---------------- */
//     const timestamp = Date.now().toString();

//     const response = await axios.post(
//       `${process.env.JUSPAY_HOST}/merchants/transactions/status360`,
//       {
//         signature: jws.signature,
//         payload: jws.payload,
//         protected: jws.protected,
//       },
//       {
//         headers: {
//           "Content-Type": "application/json",
//           "x-merchant-id": process.env.JUSPAY_MERCHANTID,
//           "x-merchant-channel-id": process.env.JUSPAY_CHANNELID,
//           "x-api-version": "3",
//           "x-timestamp": timestamp,
//           "jpupi-routing-id": merchantRequestId,
//         },
//       },
//     );

//     console.log(response);
//     /* ---------------- RESP(ONSE ---------------- */
//     res.json({
//       message: "Transaction status fetched successfully",
//       merchantRequestId,
//       statusResponse: response.data,
//     });
//   } catch (err) {
//     console.error("❌ STATUS 360 ERROR:", err.response?.data || err.message);

//     res.status(500).json({
//       message: "Failed to fetch transaction status",
//       error: err.response?.data || err.message,
//     });
//   }
// };

import axios from "axios";
import generateJWS from "../juspay/generateJWS.js";
import MetalTxn from "../models/metalTransaction.model.js";

/* ---------------- CONFIG ---------------- */
const POLL_INTERVAL_MS = 5000; // 5 seconds
const MAX_POLL_TIME_MS = 1; // 3 minutes

export const getTransactionStatus360 = async (req, res) => {
  try {
    /* ---------------- INPUT ---------------- */
    const { merchantRequestId } = req.body;

    if (!merchantRequestId) {
      return res.status(400).json({
        message: "merchantRequestId is required",
      });
    }

    /* ---------------- FETCH TXN ---------------- */
    const txn = await MetalTxn.findOne({
      merchantTransactionId: merchantRequestId,
    });

    if (!txn) {
      return res.status(404).json({
        message: "Transaction not found",
      });
    }

    /* ---------------- MARK PAYMENT INITIATED ---------------- */
    if (txn.status === "CREATED") {
      txn.status = "PAYMENT_INITIATED";
      txn.providerStatus = "USER_CLICKED_PAY";
      txn.updatedAt = new Date();
      await txn.save();
    }

    const startTime = Date.now();
    let finalStatus = null;
    let providerStatus = null;
    let lastJuspayResponse = null;

    /* ---------------- POLLING LOOP ---------------- */
    while (Date.now() - startTime < MAX_POLL_TIME_MS) {
      const payload = {
        merchantRequestId,
        transactionType: "MERCHANT_CREDITED_VIA_PAY", // ✅ DOC-CORRECT
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

      lastJuspayResponse = response.data;

      const responseCode = response.data?.responseCode;
      const txnStatus = response.data?.result?.transactionStatus;

      /* ---------------- STATUS HANDLING ---------------- */

      // ✅ Payment success
      if (txnStatus === "SUCCESS") {
        finalStatus = "SUCCESS";
        providerStatus = "SUCCESS";
        break;
      }

      // ❌ Known failure cases (from docs)
      if (
        responseCode === "REQUEST_EXPIRED" ||
        responseCode === "REQUEST_NOT_FOUND" ||
        responseCode === "DROPOUT" ||
        txnStatus === "FAILED"
      ) {
        finalStatus = "FAILED";
        providerStatus = responseCode || txnStatus;
        break;
      }

      // ⏳ Still pending
      txn.status = "PENDING";
      txn.providerStatus = txnStatus || "PENDING";
      txn.updatedAt = new Date();
      await txn.save();

      // wait before next poll
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    /* ---------------- TIMEOUT HANDLING ---------------- */
    if (!finalStatus) {
      finalStatus = "FAILED";
      providerStatus = "TIMEOUT_EXPIRED";
    }

    txn.status = finalStatus;
    txn.providerStatus = providerStatus;
    txn.updatedAt = new Date();
    await txn.save();

    /* ---------------- RESPONSE ---------------- */
    res.json({
      success: true,
      message: "Transaction verification completed",
      merchantRequestId,
      status: txn.status,
      providerStatus: txn.providerStatus,
      juspayResponse: lastJuspayResponse,
    });
  } catch (err) {
    console.error(
      "❌ STATUS 360 POLLING ERROR:",
      err.response?.data || err.message,
    );

    res.status(500).json({
      message: "Failed to verify transaction status",
      error: err.response?.data || err.message,
    });
  }
};
