import { v4 as uuidv4 } from "uuid";
import MetalTxn from "../../models/gold/metalTransaction.model.js";
import RegistrationUser from "../../models/user/user.model.js";
import { buyMetalFromAugmont } from "../../utils/gold/buy.utils.js";
import Rate from "../../models/gold/rate.model.js";

export const buyMetal = async (req, res) => {
  try {
    const { metalType, quantity, amount, lockPrice, blockId } = req.body;

    /* ------------ AUTH ------------ */
    if (!req.user?.uniqueId)
      return res.status(401).json({ message: "Unauthorized" });

    const user = await RegistrationUser.findOne({
      uniqueId: req.user.uniqueId,
    });
    if (!user) return res.status(404).json({ message: "User not found" });

    /* ------------ VALIDATION ------------ */
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

    /* ------------ CREATE PENDING TXN ------------ */
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

    /* ------------ CALL SERVICE ------------ */
    const updatedTxn = await buyMetalFromAugmont(merchantTransactionId);

    res.json({
      message: "Purchase successful",
      orderId: updatedTxn.augmontOrderId,
      txn: updatedTxn,
    });
  } catch (err) {
    console.error("❌ BUY ERROR:", err.message);
    res.status(500).json({ message: "Purchase failed" });
  }
};
