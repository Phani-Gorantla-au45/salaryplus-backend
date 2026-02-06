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

    // ---------------- STEP 1: VALIDATE RATES FROM DB ----------------

    if (!lockPrice || !blockId)
      return res.status(400).json({ message: "lockPrice & blockId required" });
    const rate = await Rate.findOne().sort({ createdAt: -1 });
    // const rate = await Rate.findOne({ status: "ACTIVE" }).sort({
    //   createdAt: -1,
    // });

    if (!rate) return res.status(400).json({ message: "Rates not available" });

    // 🔐 VALIDATE BLOCK ID
    if (rate.blockId !== blockId)
      return res
        .status(400)
        .json({ message: "Rate expired. Fetch new price." });

    // 🔐 VALIDATE PRICE
    const dbPrice = metalType === "gold" ? rate.gBuy : rate.sBuy;

    const diff = Math.abs(Number(lockPrice) - Number(dbPrice));
    if (diff > 0.01)
      return res.status(400).json({
        message: "Price mismatch. Please refresh price.",
      });

    console.log("🔒 LOCK PRICE:", lockPrice);

    // ---------------- STEP 2: SAVE TXN ----------------
    const merchantTransactionId = uuidv4().replace(/-/g, "").slice(0, 30);

    const txn = await MetalTxn.create({
      userId: user._id,
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

    const data = response.data.result.data;

    txn.augmontOrderId = data.transactionId;
    txn.rate = parseFloat(data.rate);
    txn.totalAmount = parseFloat(data.totalAmount);
    txn.preTaxAmount = parseFloat(data.preTaxAmount);
    txn.taxAmount = parseFloat(data.taxes?.totalTaxAmount);
    txn.invoiceNumber = data.invoiceNumber;
    txn.goldBalance = parseFloat(data.goldBalance);
    txn.silverBalance = parseFloat(data.silverBalance);

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

// export const sellMetal = async (req, res) => {
//   try {
//     const { metalType, quantity, amount, userBankId } = req.body;

//     if (!req.user?.id) return res.status(401).json({ message: "Unauthorized" });

//     const user = await RegistrationUser.findById(req.user.id);
//     if (!user) return res.status(404).json({ message: "User not found" });

//     if (!["gold", "silver"].includes(metalType))
//       return res.status(400).json({ message: "Invalid metalType" });

//     if ((quantity && amount) || (!quantity && !amount))
//       return res.status(400).json({ message: "Pass quantity OR amount" });

//     console.log("👤 SELL USER:", user.uniqueId);

//     // 🔹 STEP 1: GET SELL RATE
//     const rateRes = await axios.get(
//       `${process.env.AUG_URL}/merchant/v1/rates`,
//       {
//         headers: {
//           Authorization: `Bearer ${process.env.AUGMONT_TOKEN}`,
//           Accept: "application/json",
//         },
//       },
//     );

//     const rateData = rateRes.data.result.data;
//     const lockPrice =
//       metalType === "gold"
//         ? parseFloat(rateData.rates.gSell)
//         : parseFloat(rateData.rates.sSell);

//     const blockId = rateData.blockId;

//     console.log("💰 SELL LOCK PRICE:", lockPrice);

//     const merchantTransactionId = uuidv4().replace(/-/g, "").slice(0, 30);
//     const bank = await Bank.findOne({
//       userId: user._id,
//       status: "ACTIVE",
//     });

//     if (!bank || !bank.augmontBankId)
//       return res.status(400).json({ message: "No active bank linked" });

//     console.log("🏦 BANK FROM DB:", bank.augmontBankId);

//     // 🔹 SAVE PENDING TXN
//     const txn = await MetalTxn.create({
//       userId: user._id,
//       uniqueId: user.uniqueId,
//       txnType: "SELL",
//       metalType,
//       quantity,
//       amount,
//       lockPrice,
//       blockId,
//       payoutBankId: userBankId,
//       merchantTransactionId,
//       status: "PENDING",
//     });

//     // 🔥 STEP 2: CALL SELL API
//     const payload = {
//       uniqueId: user.uniqueId,
//       metalType,
//       lockPrice,
//       blockId,
//       merchantTransactionId,
//     };

//     if (quantity) payload.quantity = quantity;
//     if (amount) payload.amount = amount;

//     payload["userBank[userBankId]"] = bank.augmontBankId; // ✅ FROM DB

//     console.log("🚀 SELL PAYLOAD:", payload);

//     const response = await axios.post(
//       `${process.env.AUG_URL}/merchant/v1/sell`,
//       qs.stringify(payload),
//       {
//         headers: {
//           Authorization: `Bearer ${process.env.AUGMONT_TOKEN}`,
//           Accept: "application/json",
//           "Content-Type": "application/x-www-form-urlencoded",
//         },
//       },
//     );

//     console.log("✅ SELL SUCCESS:", response.data);

//     const data = response.data.result.data;

//     txn.rate = parseFloat(data.rate);
//     txn.totalAmount = parseFloat(data.totalAmount);
//     txn.goldBalance = parseFloat(data.goldBalance);
//     txn.silverBalance = parseFloat(data.silverBalance);
//     txn.providerStatus = response.data.message; // ⭐ ADD
//     txn.status = "SUCCESS";
//     txn.augmontOrderId = data.transactionId;

//     await txn.save();

//     res.json({
//       message: "Sell successful",
//       payoutAmount: response.data.result.data.totalAmount,
//       txn,
//     });
//   } catch (err) {
//     console.error("❌ SELL ERROR:", err.response?.data || err.message);
//     res.status(500).json({ message: "Sell failed", error: err.response?.data });
//   }
// };
export const sellMetal = async (req, res) => {
  try {
    const { metalType, quantity, amount, userBankId } = req.body;

    if (!req.user?.id) return res.status(401).json({ message: "Unauthorized" });

    const user = await RegistrationUser.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!["gold", "silver"].includes(metalType))
      return res.status(400).json({ message: "Invalid metalType" });

    if ((quantity && amount) || (!quantity && !amount))
      return res.status(400).json({ message: "Pass quantity OR amount" });

    console.log("👤 SELL USER:", user.uniqueId);

    /* --------------------------------------------------
       🔐 STEP 0: SELL ELIGIBILITY CHECK (NEW)
    -------------------------------------------------- */

    // 1️⃣ Fetch BUY txns (oldest first)
    const buyTxns = await MetalTxn.find({
      userId: user._id,
      metalType,
      txnType: "BUY",
      status: "SUCCESS",
    }).sort({ createdAt: 1 });

    if (!buyTxns.length) {
      return res.status(400).json({
        message: "No metal available to sell",
      });
    }

    // 2️⃣ Fetch SELL txns
    const sellTxns = await MetalTxn.find({
      userId: user._id,
      metalType,
      txnType: "SELL",
      status: "SUCCESS",
    });

    const totalSoldQty = sellTxns.reduce(
      (sum, t) => sum + (t.quantity || 0),
      0,
    );

    // 3️⃣ Rule: only FIRST BUY lot is sellable
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

    /* --------------------------------------------------
       🔹 STEP 1: GET SELL RATE (UNCHANGED)
    -------------------------------------------------- */

    const rateRes = await axios.get(
      `${process.env.AUG_URL}/merchant/v1/rates`,
      {
        headers: {
          Authorization: `Bearer ${process.env.AUGMONT_TOKEN}`,
          Accept: "application/json",
        },
      },
    );

    const rateData = rateRes.data.result.data;
    const lockPrice =
      metalType === "gold"
        ? parseFloat(rateData.rates.gSell)
        : parseFloat(rateData.rates.sSell);

    const blockId = rateData.blockId;

    console.log("💰 SELL LOCK PRICE:", lockPrice);

    const merchantTransactionId = uuidv4().replace(/-/g, "").slice(0, 30);

    const bank = await Bank.findOne({
      userId: user._id,
      status: "ACTIVE",
    });

    if (!bank || !bank.augmontBankId)
      return res.status(400).json({ message: "No active bank linked" });

    /* --------------------------------------------------
       🔹 SAVE PENDING TXN
    -------------------------------------------------- */

    const txn = await MetalTxn.create({
      userId: user._id,
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
       🔥 STEP 2: CALL SELL API
    -------------------------------------------------- */

    const payload = {
      uniqueId: user.uniqueId,
      metalType,
      lockPrice,
      blockId,
      merchantTransactionId,
    };

    if (quantity) payload.quantity = quantity;
    if (amount) payload.amount = amount;

    payload["userBank[userBankId]"] = bank.augmontBankId;

    console.log("🚀 SELL PAYLOAD:", payload);

    const response = await axios.post(
      `${process.env.AUG_URL}/merchant/v1/sell`,
      qs.stringify(payload),
      {
        headers: {
          Authorization: `Bearer ${process.env.AUGMONT_TOKEN}`,
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );

    const data = response.data.result.data;

    txn.rate = parseFloat(data.rate);
    txn.totalAmount = parseFloat(data.totalAmount);
    txn.goldBalance = parseFloat(data.goldBalance);
    txn.silverBalance = parseFloat(data.silverBalance);
    txn.providerStatus = response.data.message;
    txn.status = "SUCCESS";
    txn.augmontOrderId = data.transactionId;

    await txn.save();

    res.json({
      message: "Sell successful",
      payoutAmount: data.totalAmount,
      eligibleQtyRemaining: eligibleQty - (quantity || 0),
      txn,
    });
  } catch (err) {
    console.error("❌ SELL ERROR:", err.response?.data || err.message);
    res.status(500).json({ message: "Sell failed" });
  }
};
