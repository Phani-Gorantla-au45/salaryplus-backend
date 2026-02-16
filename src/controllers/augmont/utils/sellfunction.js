import axios from "axios";
import qs from "qs";
import MetalTxn from "../../../models/metalTransaction.model.js";

export const sellMetalFromAugmont = async (txnId, augmontBankId) => {
  const txn = await MetalTxn.findById(txnId);
  if (!txn) throw new Error("Transaction not found");

  const payload = {
    uniqueId: txn.uniqueId,
    metalType: txn.metalType,
    lockPrice: txn.lockPrice,
    blockId: txn.blockId,
    merchantTransactionId: txn.merchantTransactionId,
  };

  if (txn.quantity) payload.quantity = txn.quantity;
  if (txn.amount) payload.amount = txn.amount;

  payload["userBank[userBankId]"] = augmontBankId;

  try {
    const response = await axios.post(
      `${process.env.AUG_URL}/merchant/v1/sell`,
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

    txn.status = "SUCCESS";
    txn.augmontOrderId = data.transactionId;
    txn.rate = Number(data.rate);
    txn.totalAmount = Number(data.totalAmount);
    txn.goldBalance = Number(data.goldBalance);
    txn.silverBalance = Number(data.silverBalance);
    txn.providerStatus = response.data.message;

    await txn.save();
    return txn;
  } catch (err) {
    txn.status = "FAILED";
    await txn.save();
    throw err;
  }
};
