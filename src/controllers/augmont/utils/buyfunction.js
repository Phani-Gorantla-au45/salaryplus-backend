import axios from "axios";
import qs from "qs";
import MetalTxn from "../../../models/augmont/metalTransaction.model.js";

// export const buyMetalFromAugmont = async (txnId) => {
//   const txn = await MetalTxn.findById(txnId);
//   if (!txn) throw new Error("Transaction not found");

//   const payload = {
//     uniqueId: txn.uniqueId,
//     metalType: txn.metalType,
//     lockPrice: txn.lockPrice,
//     blockId: txn.blockId,
//     merchantTransactionId: txn.merchantTransactionId,
//   };

//   if (txn.quantity !== null && txn.quantity !== undefined) {
//     payload.quantity = Number(txn.quantity).toFixed(4);
//   } else if (txn.amount !== null && txn.amount !== undefined) {
//     payload.amount = Number(txn.amount).toFixed(2);
//   }

//   try {
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

//     txn.status = "SUCCESS";
//     txn.augmontOrderId = data.transactionId;
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
export const buyMetalFromAugmont = async (merchantTransactionId) => {
  const txn = await MetalTxn.findOne({ merchantTransactionId });
  if (!txn) throw new Error("Transaction not found");

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
  } else if (txn.amount !== null && txn.amount !== undefined) {
    payload.amount = Number(txn.amount).toFixed(2);
  } else {
    throw new Error("Neither quantity nor amount present for Augmont buy");
  }

  try {
    console.log("AUGMONT PAYLOAD FINAL:", payload);

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

    const data = response.data.result.data;
    console.log(data);
    txn.status = "SUCCESS";
    txn.augmontOrderId = data.transactionId;
    txn.quantity = Number(data.quantity);
    txn.rate = Number(data.rate);
    txn.totalAmount = Number(data.totalAmount);
    txn.preTaxAmount = Number(data.preTaxAmount);
    txn.taxAmount = Number(data.taxes?.totalTaxAmount);
    txn.invoiceNumber = data.invoiceNumber;
    txn.goldBalance = Number(data.goldBalance);
    txn.silverBalance = Number(data.silverBalance);

    await txn.save();
    return txn;
  } catch (err) {
    txn.status = "FAILED";
    await txn.save();
    throw err;
  }
};
