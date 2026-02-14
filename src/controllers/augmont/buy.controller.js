import axios from "axios";
import qs from "qs";
import { v4 as uuidv4 } from "uuid";
import MetalTxn from "../../models/metalTransaction.model.js";
import RegistrationUser from "../../models/registration.model.js";
import Bank from "../../models/bank.model.js";
import Rate from "../../models/rateModel.js";
export const buyMetal = async (req, res) => {
  try {
    const { metalType, quantity, amount, lockPrice, blockId } = req.body;

    if (!req.user?.uniqueId)
      return res.status(401).json({ message: "Unauthorized" });
    const user = await RegistrationUser.findOne({
      uniqueId: req.user.uniqueId,
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    if (!metalType)
      return res.status(400).json({ message: "metalType required" });

    if (!["gold", "silver"].includes(metalType))
      return res.status(400).json({ message: "Invalid metalType" });

    if ((quantity && amount) || (!quantity && !amount))
      return res
        .status(400)
        .json({ message: "Pass either quantity or amount" });

    if (!lockPrice || !blockId)
      return res.status(400).json({ message: "lockPrice & blockId required" });

    const rate = await Rate.findOne().sort({ createdAt: -1 });
    if (!rate) return res.status(400).json({ message: "Rates not available" });

    if (rate.blockId !== blockId)
      return res
        .status(400)
        .json({ message: "Rate expired. Fetch new price." });

    const merchantTransactionId = uuidv4().replace(/-/g, "").slice(0, 30);

    const txn = await MetalTxn.create({
      uniqueId: user.uniqueId,
      txnType: "BUY",
      metalType,
      quantity,
      amount,
      lockPrice,
      blockId,
      merchantTransactionId,
      status: "PENDING",
    });

    const response = await buyMetalFromAugmont({
      uniqueId: user.uniqueId,
      metalType,
      quantity,
      amount,
      lockPrice,
      blockId,
      merchantTransactionId,
    });

    const data = response.data.result.data;

    txn.status = "SUCCESS";
    txn.augmontOrderId = data.transactionId;
    txn.rate = Number(data.rate);
    txn.totalAmount = Number(data.totalAmount);
    txn.preTaxAmount = Number(data.preTaxAmount);
    txn.taxAmount = Number(data.taxes?.totalTaxAmount);
    txn.invoiceNumber = data.invoiceNumber;
    txn.goldBalance = Number(data.goldBalance);
    txn.silverBalance = Number(data.silverBalance);

    await txn.save();

    res.json({
      message: "Purchase successful",
      orderId: txn.augmontOrderId,
      txn,
    });
  } catch (err) {
    console.error("❌ BUY ERROR:", err.response?.data || err.message);
    res.status(500).json({ message: "Purchase failed" });
  }
};
const buyMetalFromAugmont = async ({
  uniqueId,
  metalType,
  quantity,
  amount,
  lockPrice,
  blockId,
  merchantTransactionId,
}) => {
  const payload = {
    uniqueId,
    metalType,
    lockPrice,
    blockId,
    merchantTransactionId,
  };

  if (quantity) payload.quantity = quantity;
  if (amount) payload.amount = amount;

  return axios.post(
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
};

export const sellMetal = async (req, res) => {
  try {
    const { metalType, quantity, amount, userBankId } = req.body;

    /* ---------------- AUTH ---------------- */
    if (!req.user?.uniqueId)
      return res.status(401).json({ message: "Unauthorized" });

    const user = await RegistrationUser.findOne({
      uniqueId: req.user.uniqueId,
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    /* ---------------- VALIDATION ---------------- */
    if (!metalType)
      return res.status(400).json({ message: "metalType required" });

    if (!["gold", "silver"].includes(metalType))
      return res.status(400).json({ message: "Invalid metalType" });

    if ((quantity && amount) || (!quantity && !amount))
      return res
        .status(400)
        .json({ message: "Pass either quantity or amount" });

    /* --------------------------------------------------
       🔐 STEP 0: SELL ELIGIBILITY CHECK (UNCHANGED)
    -------------------------------------------------- */

    const buyTxns = await MetalTxn.find({
      uniqueId: user.uniqueId,
      metalType,
      txnType: "BUY",
      status: "SUCCESS",
    }).sort({ createdAt: 1 });

    if (!buyTxns.length) {
      return res.status(400).json({ message: "No metal available to sell" });
    }

    const sellTxns = await MetalTxn.find({
      uniqueId: user.uniqueId,
      metalType,
      txnType: "SELL",
      status: "SUCCESS",
    });

    const totalSoldQty = sellTxns.reduce(
      (sum, t) => sum + (t.quantity || 0),
      0,
    );

    // Rule: only FIRST BUY lot is sellable
    const firstBuyQty = buyTxns[0].quantity;
    const eligibleQty = firstBuyQty - totalSoldQty;

    if (eligibleQty <= 0) {
      return res.status(400).json({
        message: "No eligible quantity available for selling",
      });
    }

    if (quantity && quantity > eligibleQty) {
      return res.status(400).json({
        message: `You can sell only ${eligibleQty} gram at this time`,
      });
    }

    //fetching reates from the db

    const rate = await Rate.findOne().sort({ createdAt: -1 });
    if (!rate) return res.status(400).json({ message: "Rates not available" });

    const lockPrice =
      metalType === "gold" ? Number(rate.gSell) : Number(rate.sSell);

    const blockId = rate.blockId;

    /* ---------------- BANK ---------------- */
    const bank = await Bank.findOne({
      uniqueId: user.uniqueId,
      status: "ACTIVE",
    });

    if (!bank || !bank.augmontBankId)
      return res.status(400).json({ message: "No active bank linked" });
    const merchantTransactionId = uuidv4().replace(/-/g, "").slice(0, 30);

    /* --------------------------------------------------
       🔹 CREATE PENDING TXN (SAME PATTERN AS BUY)
    -------------------------------------------------- */

    const txn = await MetalTxn.create({
      uniqueId: user.uniqueId,
      txnType: "SELL",
      metalType,
      quantity,
      amount,
      lockPrice,
      blockId,
      payoutBankId: userBankId,
      merchantTransactionId,
      status: "PENDING",
    });

    /* --------------------------------------------------
       🔥 STEP 2: CALL AUGMONT SELL API
    -------------------------------------------------- */

    const response = await sellMetalFromAugmont({
      uniqueId: user.uniqueId,
      metalType,
      quantity,
      amount,
      lockPrice,
      blockId,
      merchantTransactionId,
      augmontBankId: bank.augmontBankId,
    });

    const data = response.data.result.data;

    /* --------------------------------------------------
       ✅ UPDATE TXN SUCCESS
    -------------------------------------------------- */

    txn.status = "SUCCESS";
    txn.augmontOrderId = data.transactionId;
    txn.rate = Number(data.rate);
    txn.totalAmount = Number(data.totalAmount);
    txn.goldBalance = Number(data.goldBalance);
    txn.silverBalance = Number(data.silverBalance);
    txn.providerStatus = response.data.message;

    await txn.save();

    res.json({
      message: "Sell successful",
      payoutAmount: txn.totalAmount,
      eligibleQtyRemaining: eligibleQty - (quantity || 0),
      txn,
    });
  } catch (err) {
    console.error("❌ SELL ERROR:", err.response?.data || err.message);
    res.status(500).json({ message: "Sell failed" });
  }
};

const sellMetalFromAugmont = async ({
  uniqueId,
  metalType,
  quantity,
  amount,
  lockPrice,
  blockId,
  merchantTransactionId,
  augmontBankId,
}) => {
  const payload = {
    uniqueId,
    metalType,
    lockPrice,
    blockId,
    merchantTransactionId,
  };

  if (quantity) payload.quantity = quantity;
  if (amount) payload.amount = amount;

  payload["userBank[userBankId]"] = augmontBankId;

  return axios.post(
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
};
