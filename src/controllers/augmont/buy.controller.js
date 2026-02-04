import axios from "axios";
import qs from "qs";
import { v4 as uuidv4 } from "uuid";
import MetalTxn from "../../models/metalTransaction.model.js";
import RegistrationUser from "../../models/registration.model.js";

export const buyMetal = async (req, res) => {
  try {
    const { metalType, quantity, amount } = req.body;

    if (!req.user?.id) return res.status(401).json({ message: "Unauthorized" });

    const user = await RegistrationUser.findById(req.user.id);

    // 🔹 VALIDATIONS
    if (!metalType)
      return res.status(400).json({ message: "metalType required" });

    if ((quantity && amount) || (!quantity && !amount))
      return res
        .status(400)
        .json({ message: "Pass either quantity or amount" });

    if (!["gold", "silver"].includes(metalType))
      return res.status(400).json({ message: "Invalid metalType" });

    if (quantity && (isNaN(quantity) || quantity <= 0))
      return res.status(400).json({ message: "Invalid quantity" });

    if (amount && (isNaN(amount) || amount <= 0))
      return res.status(400).json({ message: "Invalid amount" });

    if (metalType === "gold" && quantity > 1000)
      return res.status(400).json({ message: "Gold max 1000g" });

    if (metalType === "silver" && quantity > 20000)
      return res.status(400).json({ message: "Silver max 20000g" });

    if (amount && amount > 5000000)
      return res.status(400).json({ message: "Amount limit exceeded" });

    const merchantTransactionId = uuidv4();

    // 🔥 STEP 1 — FETCH FRESH RATE FROM AUGMONT
    const rateUrl = `${process.env.AUG_URL}/merchant/v1/rates`;

    const rateRes = await axios.get(rateUrl, {
      headers: {
        Authorization: `Bearer ${process.env.AUGMONT_TOKEN}`,
        Accept: "application/json",
      },
    });

    const rates = rateRes.data.result?.data?.rates;
    const blockId = rateRes.data.result?.data?.blockId;

    if (!rates || !blockId)
      return res.status(400).json({ message: "Failed to fetch live rate" });

    const lockPrice =
      metalType === "gold" ? parseFloat(rates.gBuy) : parseFloat(rates.sBuy);

    // 💾 STEP 2 — SAVE TRANSACTION
    const txn = await MetalTxn.create({
      userId: user._id,
      uniqueId: user.uniqueId,
      metalType,
      quantity,
      amount,
      lockPrice,
      blockId,
      merchantTransactionId,
      status: "PENDING",
    });

    // 🔥 STEP 3 — CALL BUY API
    const buyUrl = `${process.env.AUG_URL}/merchant/v1/buy`;

    const payload = {
      uniqueId: user.uniqueId,
      metalType,
      lockPrice,
      blockId,
      merchantTransactionId,
    };

    if (quantity) payload.quantity = quantity;
    if (amount) payload.amount = amount;

    const response = await axios.post(buyUrl, qs.stringify(payload), {
      headers: {
        Authorization: `Bearer ${process.env.AUGMONT_TOKEN}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
    });

    txn.augmontOrderId = response.data?.result?.orderId;
    txn.status = "SUCCESS";
    await txn.save();

    res.json({
      message: "Purchase successful",
      orderId: txn.augmontOrderId,
      txn,
    });
  } catch (err) {
    console.error("BUY ERROR:", err.response?.data || err.message);
    res.status(500).json({ message: "Purchase failed" });
  }
};
