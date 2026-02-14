import axios from "axios";
import qs from "qs";
import { v4 as uuidv4 } from "uuid";

import RegistrationUser from "../../models/registration.model.js";
import UserAddress from "../../models/userAddress.model.js";
import AugmontProduct from "../../models/product.model.js";
import Order from "../../models/order.model.js";
export const createOrder = async (req, res) => {
  try {
    const { sku, quantity } = req.body;

    if (!req.user?.uniqueId)
      return res.status(401).json({ message: "Unauthorized" });

    // ✅ USER SENDS ONLY SKU + QUANTITY
    if (!sku || !quantity)
      return res.status(400).json({ message: "sku & quantity required" });

    if (!Number.isInteger(quantity) || quantity <= 0)
      return res.status(400).json({ message: "Invalid quantity" });

    // 🔹 USER
    const user = await RegistrationUser.findOne({
      uniqueId: req.user.uniqueId,
    });

    if (!user?.uniqueId)
      return res.status(400).json({ message: "User not linked to Augmont" });

    // 🔹 ADDRESS (AUTO PICK ACTIVE)
    const address = await UserAddress.findOne({
      uniqueId: user.uniqueId,
      status: "ACTIVE",
    });

    if (!address?.augmontAddressId)
      return res.status(400).json({ message: "No active address found" });

    // 🔹 PRODUCT VALIDATION
    const product = await AugmontProduct.findOne({ sku });
    if (!product)
      return res.status(400).json({ message: "Invalid product SKU" });

    // 🔹 TRANSACTION ID
    const merchantTransactionId = uuidv4();

    // 🔥 AUGMONT ORDER PAYLOAD
    const payload = {
      uniqueId: user.uniqueId,
      merchantTransactionId,
      "user[shipping][addressId]": address.augmontAddressId,
      "product[0][sku]": sku,
      "product[0][quantity]": quantity,
    };

    if (user.phone) payload.mobileNumber = user.phone;

    const response = await axios.post(
      `${process.env.AUG_URL}/merchant/v1/order`,
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

    // 🔹 SAVE ORDER LOCALLY
    const order = await Order.create({
      uniqueId: user.uniqueId,
      merchantTransactionId,
      augmontOrderId: data.orderId,
      addressId: address.augmontAddressId,
      products: [{ sku, quantity }],
      shippingCharges: Number(data.shippingCharges),
      goldBalance: Number(data.goldBalance),
      silverBalance: Number(data.silverBalance),
      status: "SUCCESS",
    });

    res.json({
      message: "Order placed successfully",
      order,
    });
  } catch (err) {
    console.error("❌ ORDER ERROR:", err.response?.data || err.message);
    res.status(500).json({
      message: "Order failed",
      error: err.response?.data || err.message,
    });
  }
};
