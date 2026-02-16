import axios from "axios";
import generateJWS from "../juspay/generateJWS.js";

export const createWebCollect = async (req, res) => {
  try {
    /* ---------------- AUTH ---------------- */
    if (!req.user?.uniqueId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    /* ---------------- INPUT ---------------- */
    const { amount, payerVpa, payerName } = req.body;

    if (!amount || !payerVpa) {
      return res.status(400).json({
        message: "amount and payerVpa are required",
      });
    }

    const formattedAmount = Number(amount).toFixed(2);
    if (isNaN(formattedAmount)) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    /* ---------------- IDS ---------------- */
    const merchantRequestId =
      `COLLECT_${req.user.uniqueId}_${Date.now()}`.slice(0, 35);

    /* ---------------- PAYLOAD ---------------- */
    const payload = {
      merchantRequestId,
      payerVpa,
      payerName: payerName || undefined,
      payeeVpa: process.env.JUSPAY_VPA,
      collectRequestExpiryMinutes: "10",
      amount: formattedAmount,
      remarks: "gold payment",
      iat: Date.now().toString(),
      udfParameters: "{}",
    };

    /* ---------------- JWS ---------------- */
    const jws = await generateJWS(payload, process.env.JUSPAY_KID);

    /* ---------------- CALL JUSPAY ---------------- */
    const timestamp = Date.now().toString();

    const response = await axios.post(
      `${process.env.JUSPAY_HOST}/merchants/transactions/webCollect360`,
      {
        signature: jws.signature,
        payload: jws.payload,
        protected: jws.protected,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-merchant-id": process.env.JUSPAY_MERCHANTID,
          "x-merchant-channel-id": process.env.JUSPAY_CHANNELID,
          "x-api-version": "3",
          "x-timestamp": timestamp,
          "jpupi-routing-id": merchantRequestId,
        },
      },
    );

    /* ---------------- RESPONSE ---------------- */
    res.json({
      message: "Web collect request sent successfully",
      merchantRequestId,
      juspayResponse: response.data,
    });
  } catch (err) {
    console.error("❌ WEB COLLECT ERROR:", err.response?.data || err.message);

    res.status(500).json({
      message: "Failed to create web collect request",
      error: err.response?.data || err.message,
    });
  }
};
