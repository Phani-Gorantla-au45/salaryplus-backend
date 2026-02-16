import axios from "axios";
import qs from "qs";
import Order from "../../../models/order.model.js";

export const createOrderFromAugmont = async ({
  uniqueId,
  merchantTransactionId,
  augmontAddressId,
  sku,
  quantity,
  mobileNumber,
}) => {
  const payload = {
    uniqueId,
    merchantTransactionId,
    "user[shipping][addressId]": augmontAddressId,
    "product[0][sku]": sku,
    "product[0][quantity]": quantity,
  };

  if (mobileNumber) payload.mobileNumber = mobileNumber;

  try {
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
      uniqueId,
      merchantTransactionId,
      augmontOrderId: data.orderId,
      addressId: augmontAddressId,
      products: [{ sku, quantity }],
      shippingCharges: Number(data.shippingCharges),
      goldBalance: Number(data.goldBalance),
      silverBalance: Number(data.silverBalance),
      status: "SUCCESS",
    });

    return order;
  } catch (err) {
    throw err;
  }
};
