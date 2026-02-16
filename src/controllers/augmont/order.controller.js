import { v4 as uuidv4 } from "uuid";
import RegistrationUser from "../../models/registration/registration.model.js";
import UserAddress from "../../models/augmont/userAddress.model.js";
import AugmontProduct from "../../models/augmont/product.model.js";
import { createOrderFromAugmont } from "../augmont/utils/orderfunction.js";
export const createOrder = async (req, res) => {
  try {
    const { sku, quantity } = req.body;

    /* ------------ AUTH ------------ */
    if (!req.user?.uniqueId)
      return res.status(401).json({ message: "Unauthorized" });

    /* ------------ VALIDATION ------------ */
    if (!sku || !quantity)
      return res.status(400).json({ message: "sku & quantity required" });

    if (!Number.isInteger(quantity) || quantity <= 0)
      return res.status(400).json({ message: "Invalid quantity" });

    /* ------------ USER ------------ */
    const user = await RegistrationUser.findOne({
      uniqueId: req.user.uniqueId,
    });

    if (!user?.uniqueId)
      return res.status(400).json({ message: "User not linked to Augmont" });

    /* ------------ ADDRESS ------------ */
    const address = await UserAddress.findOne({
      uniqueId: user.uniqueId,
      status: "ACTIVE",
    });

    if (!address?.augmontAddressId)
      return res.status(400).json({ message: "No active address found" });

    /* ------------ PRODUCT ------------ */
    const product = await AugmontProduct.findOne({ sku });
    if (!product)
      return res.status(400).json({ message: "Invalid product SKU" });

    /* ------------ CREATE ORDER ------------ */
    const merchantTransactionId = uuidv4();

    const order = await createOrderFromAugmont({
      uniqueId: user.uniqueId,
      merchantTransactionId,
      augmontAddressId: address.augmontAddressId,
      sku,
      quantity,
      mobileNumber: user.phone,
    });

    /* ------------ FRONTEND RESPONSE ------------ */
    res.json({
      success: true,
      message: "Order placed successfully",
      data: {
        merchantTransactionId,
        orderId: order.augmontOrderId,
        shippingCharges: order.shippingCharges,
        goldBalance: order.goldBalance,
        silverBalance: order.silverBalance,
      },
    });
  } catch (err) {
    console.error("❌ ORDER ERROR:", err.message);
    res.status(500).json({
      success: false,
      message: "Order failed",
    });
  }
};
