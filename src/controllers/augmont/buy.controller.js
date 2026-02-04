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
    if (!user) return res.status(404).json({ message: "User not found" });

    console.log("👤 USER:", {
      uniqueId: user.uniqueId,
      phone: user.phone,
    });

    // ---------------- VALIDATIONS ----------------
    if (!metalType)
      return res.status(400).json({ message: "metalType required" });

    if ((quantity && amount) || (!quantity && !amount))
      return res
        .status(400)
        .json({ message: "Pass either quantity or amount" });

    if (!["gold", "silver"].includes(metalType))
      return res.status(400).json({ message: "Invalid metalType" });

    // ---------------- STEP 1: GET TRADING RATES ----------------
    const rateUrl = `${process.env.AUG_URL}/merchant/v1/rates`;

    const rateRes = await axios.get(rateUrl, {
      headers: {
        Authorization: `Bearer ${process.env.AUGMONT_TOKEN}`,
        Accept: "application/json",
      },
    });

    console.log("📊 RATE RESPONSE:", JSON.stringify(rateRes.data, null, 2));

    const rateData = rateRes.data.result?.data;
    const rates = rateData?.rates;
    const blockId = rateData?.blockId;

    console.log("🧱 BLOCK ID:", blockId);
    console.log("💰 RATES OBJECT:", rates);

    const lockPrice =
      metalType === "gold" ? parseFloat(rates?.gBuy) : parseFloat(rates?.sBuy);

    console.log("🔒 LOCK PRICE:", lockPrice);

    if (!blockId || isNaN(lockPrice))
      return res
        .status(400)
        .json({ message: "Failed to fetch valid rate data" });

    // ---------------- STEP 2: SAVE TXN ----------------
    const merchantTransactionId = uuidv4().replace(/-/g, "").slice(0, 30);

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

    // ---------------- STEP 3: CALL BUY API ----------------
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

    console.log("🚀 BUY PAYLOAD:", payload);

    const response = await axios.post(buyUrl, qs.stringify(payload), {
      headers: {
        Authorization: `Bearer ${process.env.AUGMONT_TOKEN}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
    });

    console.log("✅ BUY RESPONSE:", JSON.stringify(response.data, null, 2));

    txn.augmontOrderId = response.data?.result?.data?.transactionId;
    txn.status = "SUCCESS";
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
