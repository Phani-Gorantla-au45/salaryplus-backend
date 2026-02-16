import axios from "axios";
import qs from "qs";
import { v4 as uuidv4 } from "uuid";
import MetalTxn from "../../models/metalTransaction.model.js";
import RegistrationUser from "../../models/registration.model.js";
import Bank from "../../models/bank.model.js";
import Rate from "../../models/rateModel.js";
import { sellMetalFromAugmont } from "../augmont/utils/sellfunction.js";

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

    /* ---------------- RATE FROM DB ---------------- */
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

    /* ---------------- CREATE PENDING TXN ---------------- */
    const merchantTransactionId = uuidv4().replace(/-/g, "").slice(0, 30);

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

    /* ---------------- CALL SELL HANDLER ---------------- */
    const updatedTxn = await sellMetalFromAugmont(txn._id, bank.augmontBankId);

    res.json({
      message: "Sell successful",
      payoutAmount: updatedTxn.totalAmount,
      txn: updatedTxn,
    });
  } catch (err) {
    console.error("❌ SELL ERROR:", err.message);
    res.status(500).json({ message: "Sell failed" });
  }
};
