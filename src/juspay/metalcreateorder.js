// import axios from "axios";
// import generateJWS from "../juspay/generateJWS.js";
// import MetalTxn from "../../models/metalTransaction.model.js";

// /* 🔹 Helper to generate UPI deeplink */
// const generateUpiDeeplink = ({
//   payeeVpa,
//   payeeName,
//   mcc,
//   gatewayTransactionId,
//   orderId,
//   amount,
//   remarks,
// }) => {
//   const params = new URLSearchParams({
//     pa: payeeVpa,
//     pn: payeeName,
//     mc: mcc,
//     tid: gatewayTransactionId,
//     tr: orderId,
//     am: amount,
//     cu: "INR",
//     tn: remarks,
//   });

//   return `upi://pay?${params.toString()}`;
// };

// export const createMetalIntent = async (req, res) => {
//   try {
//     /* ---------------- AUTH ---------------- */
//     if (!req.user?.uniqueId)
//       return res.status(401).json({ message: "Unauthorized" });

//     const { metalType, amount, lockPrice, blockId } = req.body;

//     if (!metalType || !amount || !lockPrice || !blockId)
//       return res.status(400).json({ message: "Missing required fields" });

//     const formattedAmount = Number(amount).toFixed(2);
//     if (isNaN(formattedAmount))
//       return res.status(400).json({ message: "Invalid amount" });

//     /* ---------------- MERCHANT TXN ID ---------------- */
//     const merchantTransactionId = `METAL_${req.user.uniqueId}_${Date.now()}`.slice(
//       0,
//       35,
//     );

//     /* ---------------- JUSPAY PAYLOAD ---------------- */
//     const payload = {
//       merchantRequestId: merchantTransactionId,
//       amount: formattedAmount,
//       currency: "INR",
//       flow: "TRANSACTION",
//       remarks: "Metal purchase",
//       iat: Date.now().toString(),
//     };

//     const jws = await generateJWS(payload, process.env.JUSPAY_KID);

//     /* ---------------- REGISTER INTENT ---------------- */
//     const juspayResponse = await axios.post(
//       `${process.env.JUSPAY_HOST}/merchants/transactions/registerIntent`,
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
//           "x-timestamp": Date.now().toString(),
//           "jpupi-routing-id": merchantTransactionId,
//         },
//       },
//     );

//     const jp = juspayResponse.data.payload;

//     /* ---------------- SAVE TXN (CREATED) ---------------- */
//     await MetalTxn.create({
//       uniqueId: req.user.uniqueId,
//       txnType: "BUY",
//       metalType,
//       amount: Number(formattedAmount),
//       lockPrice,
//       blockId,
//       merchantTransactionId,
//       status: "CREATED",
//       providerStatus: "UPI_INTENT_CREATED",
//       createdAt: new Date(),
//     });

//     /* ---------------- DEEPLINK ---------------- */
//     const upiDeeplink = generateUpiDeeplink({
//       payeeVpa: jp.payeeVpa,
//       payeeName: jp.payeeName,
//       mcc: process.env.JUSPAY_MCC,
//       gatewayTransactionId: jp.gatewayTransactionId,
//       orderId: jp.orderId,
//       amount: jp.amount,
//       remarks: jp.remarks,
//     });

//     res.json({
//       success: true,
//       message: "UPI intent created",
//       data: {
//         merchantTransactionId,
//         upiDeeplink,
//       },
//     });
//   } catch (err) {
//     console.error("❌ CREATE INTENT ERROR:", err.response?.data || err.message);
//     res.status(500).json({ message: "Failed to create UPI intent" });
//   }
// };
// import axios from "axios";
// import generateJWS from "../juspay/generateJWS.js";
// import MetalTxn from "../models/metalTransaction.model.js";

// /* 🔹 Helper to generate UPI deeplink */
// const generateUpiDeeplink = ({
//   payeeVpa,
//   payeeName,
//   mcc,
//   gatewayTransactionId,
//   orderId,
//   amount,
//   remarks,
// }) => {
//   const params = new URLSearchParams({
//     pa: payeeVpa,
//     pn: payeeName,
//     mc: mcc,
//     tid: gatewayTransactionId,
//     tr: orderId,
//     am: amount,
//     cu: "INR",
//     tn: remarks,
//   });

//   return `upi://pay?${params.toString()}`;
// };

// export const createMetalIntent = async (req, res) => {
//   try {
//     /* ---------------- AUTH ---------------- */
//     if (!req.user?.uniqueId)
//       return res.status(401).json({ message: "Unauthorized" });

//     const { metalType, amount, lockPrice, blockId } = req.body;

//     if (!metalType || !amount || !lockPrice || !blockId)
//       return res.status(400).json({ message: "Missing required fields" });

//     const formattedAmount = Number(amount).toFixed(2);
//     if (isNaN(formattedAmount))
//       return res.status(400).json({ message: "Invalid amount" });

//     /* ---------------- MERCHANT TXN ID ---------------- */
//     const merchantTransactionId =
//       `METAL_${req.user.uniqueId}_${Date.now()}`.slice(0, 35);

//     /* ---------------- JUSPAY PAYLOAD ---------------- */
//     const payload = {
//       merchantRequestId: merchantTransactionId,
//       amount: formattedAmount,
//       currency: "INR",
//       flow: "TRANSACTION",
//       remarks: "Metal purchase",
//       intentRequestExpiryMinutes: "3",
//       iat: Date.now().toString(),
//     };

//     const jws = await generateJWS(payload, process.env.JUSPAY_KID);

//     /* ---------------- REGISTER INTENT ---------------- */
//     const juspayResponse = await axios.post(
//       `${process.env.JUSPAY_HOST}/merchants/transactions/registerIntent`,
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
//           "x-timestamp": Date.now().toString(),
//           "jpupi-routing-id": merchantTransactionId,
//         },
//       },
//     );

//     const jp = juspayResponse.data.payload;

//     /* ---------------- SAVE TXN (CREATED) ---------------- */
//     await MetalTxn.create({
//       uniqueId: req.user.uniqueId,
//       txnType: "BUY",
//       metalType,
//       amount: Number(formattedAmount),
//       lockPrice,
//       blockId,
//       merchantTransactionId,
//       status: "CREATED",
//       providerStatus: "UPI_INTENT_CREATED",
//       createdAt: new Date(),
//     });

//     /* ---------------- DEEPLINK ---------------- */
//     const upiDeeplink = generateUpiDeeplink({
//       payeeVpa: jp.payeeVpa,
//       payeeName: jp.payeeName,
//       mcc: process.env.JUSPAY_MCC,
//       gatewayTransactionId: jp.gatewayTransactionId,
//       orderId: jp.orderId,
//       amount: jp.amount,
//       remarks: jp.remarks,
//     });

//     res.json({
//       success: true,
//       message: "UPI intent created",
//       data: {
//         merchantTransactionId,
//         upiDeeplink,
//       },
//     });
//   } catch (err) {
//     console.error("❌ CREATE INTENT ERROR:", err.response?.data || err.message);
//     res.status(500).json({ message: "Failed to create UPI intent" });
//   }
// };
