// import axios from "axios";
// import qs from "qs";
// import MetalTxn from "../../../models/augmont/metalTransaction.model.js";

// // export const buyMetalFromAugmont = async (txnId) => {
// //   const txn = await MetalTxn.findById(txnId);
// //   if (!txn) throw new Error("Transaction not found");

// //   const payload = {
// //     uniqueId: txn.uniqueId,
// //     metalType: txn.metalType,
// //     lockPrice: txn.lockPrice,
// //     blockId: txn.blockId,
// //     merchantTransactionId: txn.merchantTransactionId,
// //   };

// //   if (txn.quantity !== null && txn.quantity !== undefined) {
// //     payload.quantity = Number(txn.quantity).toFixed(4);
// //   } else if (txn.amount !== null && txn.amount !== undefined) {
// //     payload.amount = Number(txn.amount).toFixed(2);
// //   }

// //   try {
// //     const response = await axios.post(
// //       `${process.env.AUG_URL}/merchant/v1/buy`,
// //       qs.stringify(payload),
// //       {
// //         headers: {
// //           Authorization: `Bearer ${process.env.AUGMONT_TOKEN}`,
// //           "Content-Type": "application/x-www-form-urlencoded",
// //           Accept: "application/json",
// //         },
// //       },
// //     );

// //     const data = response.data.result.data;

// //     txn.status = "SUCCESS";
// //     txn.augmontOrderId = data.transactionId;
// //     txn.rate = Number(data.rate);
// //     txn.totalAmount = Number(data.totalAmount);
// //     txn.preTaxAmount = Number(data.preTaxAmount);
// //     txn.taxAmount = Number(data.taxes?.totalTaxAmount);
// //     txn.invoiceNumber = data.invoiceNumber;
// //     txn.goldBalance = Number(data.goldBalance);
// //     txn.silverBalance = Number(data.silverBalance);

// //     await txn.save();
// //     return txn;
// //   } catch (err) {
// //     txn.status = "FAILED";
// //     await txn.save();
// //     throw err;
// //   }
// // };
// export const buyMetalFromAugmont = async (merchantTransactionId) => {
//   const txn = await MetalTxn.findOne({ merchantTransactionId });
//   if (!txn) throw new Error("Transaction not found");

//   const payload = {
//     uniqueId: txn.uniqueId,
//     metalType: txn.metalType,
//     lockPrice: txn.lockPrice,
//     blockId: txn.blockId,
//     merchantTransactionId: txn.merchantTransactionId,
//   };

//   // ✅ STRICT MUTUAL EXCLUSIVITY
//   if (txn.quantity !== null && txn.quantity !== undefined) {
//     payload.quantity = Number(txn.quantity).toFixed(4);
//   } else if (txn.amount !== null && txn.amount !== undefined) {
//     payload.amount = Number(txn.amount).toFixed(2);
//   } else {
//     throw new Error("Neither quantity nor amount present for Augmont buy");
//   }

//   try {
//     console.log("AUGMONT PAYLOAD FINAL:", payload);

//     const response = await axios.post(
//       `${process.env.AUG_URL}/merchant/v1/buy`,
//       qs.stringify(payload),
//       {
//         headers: {
//           Authorization: `Bearer ${process.env.AUGMONT_TOKEN}`,
//           "Content-Type": "application/x-www-form-urlencoded",
//           Accept: "application/json",
//         },
//       },
//     );

//     const data = response.data.result.data;
//     console.log(data);
//     txn.status = "SUCCESS";
//     txn.augmontOrderId = data.transactionId;
//     txn.quantity = Number(data.quantity);
//     txn.rate = Number(data.rate);
//     txn.totalAmount = Number(data.totalAmount);
//     txn.preTaxAmount = Number(data.preTaxAmount);
//     txn.taxAmount = Number(data.taxes?.totalTaxAmount);
//     txn.invoiceNumber = data.invoiceNumber;
//     txn.goldBalance = Number(data.goldBalance);
//     txn.silverBalance = Number(data.silverBalance);

//     await txn.save();
//     return txn;
//   } catch (err) {
//     txn.status = "FAILED";
//     await txn.save();
//     throw err;
//   }
// };
import axios from "axios";
import qs from "qs";
import MetalTxn from "../../../models/augmont/metalTransaction.model.js";

export const buyMetalFromAugmont = async (merchantTransactionId) => {
  console.log("🏗️ [AUGMONT BUY] Function called");
  console.log("🆔 [AUGMONT BUY] txnId received:", merchantTransactionId);

  /* ---------------- FETCH TRANSACTION ---------------- */
  const txn = await MetalTxn.findById(merchantTransactionId);

  if (!txn) {
    console.error("❌ [AUGMONT BUY] Transaction NOT FOUND for txnId:", txnId);
    throw new Error("Transaction not found");
  }

  console.log("🗄️ [AUGMONT BUY] Transaction found:", {
    _id: txn._id,
    merchantTransactionId: txn.merchantTransactionId,
    uniqueId: txn.uniqueId,
    status: txn.status,
  });

  /* ---------------- BUILD PAYLOAD ---------------- */
  const payload = {
    uniqueId: txn.uniqueId,
    metalType: txn.metalType,
    lockPrice: txn.lockPrice,
    blockId: txn.blockId,
    merchantTransactionId: txn.merchantTransactionId,
  };

  // ✅ STRICT MUTUAL EXCLUSIVITY
  if (txn.quantity !== null && txn.quantity !== undefined) {
    payload.quantity = Number(txn.quantity).toFixed(4);
    console.log("📏 [AUGMONT BUY] Using quantity:", payload.quantity);
  } else if (txn.amount !== null && txn.amount !== undefined) {
    payload.amount = Number(txn.amount).toFixed(2);
    console.log("💰 [AUGMONT BUY] Using amount:", payload.amount);
  } else {
    console.error("❌ [AUGMONT BUY] Neither quantity nor amount present");
    throw new Error("Neither quantity nor amount present for Augmont buy");
  }

  console.log("📦 [AUGMONT BUY] FINAL PAYLOAD:", payload);

  /* ---------------- CALL AUGMONT ---------------- */
  try {
    console.log("📡 [AUGMONT BUY] Calling Augmont BUY API");

    const response = await axios.post(
      `${process.env.AUG_URL}/merchant/v1/buy`,
      qs.stringify(payload),
      {
        headers: {
          Authorization: `Bearer ${process.env.AUGMONT_TOKEN}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
      },
    );

    const data = response.data?.result?.data;

    console.log("✅ [AUGMONT BUY] Augmont response data:", data);

    /* ---------------- UPDATE TXN ---------------- */
    txn.status = "SUCCESS";
    txn.providerStatus = "SUCCESS";
    txn.augmontOrderId = data.transactionId;
    txn.quantity = Number(data.quantity);
    txn.rate = Number(data.rate);
    txn.totalAmount = Number(data.totalAmount);
    txn.preTaxAmount = Number(data.preTaxAmount);
    txn.taxAmount = Number(data.taxes?.totalTaxAmount);
    txn.invoiceNumber = data.invoiceNumber;
    txn.goldBalance = Number(data.goldBalance);
    txn.silverBalance = Number(data.silverBalance);
    txn.updatedAt = new Date();

    await txn.save();

    console.log("🏅 [AUGMONT BUY] Transaction updated & saved successfully");
    console.log("🎉 [AUGMONT BUY] GOLD ALLOCATION COMPLETED");

    return txn;
  } catch (err) {
    console.error(
      "🔥 [AUGMONT BUY] Augmont BUY FAILED:",
      err.response?.data || err.message,
    );

    txn.status = "FAILED";
    txn.providerStatus = "AUGMONT_BUY_FAILED";
    txn.updatedAt = new Date();
    await txn.save();

    console.log("💾 [AUGMONT BUY] Transaction marked as FAILED");

    throw err;
  }
};
