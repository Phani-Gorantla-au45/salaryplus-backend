import axios from "axios";
import generateJWS from "../juspay/generateJWS.js";

export const verifyVpa360 = async (req, res) => {
  try {
    /* ---------------- INPUT ---------------- */
    const { vpa } = req.body;

    if (!vpa) {
      return res.status(400).json({ message: "VPA is required" });
    }

    /* ---------------- PAYLOAD ---------------- */
    const upiRequestId = `YJP${Date.now()}${Math.random()
      .toString(36)
      .substring(2, 10)}`.slice(0, 35);

    const payload = {
      vpa,
      upiRequestId,
      iat: Date.now().toString(),
      udfParameters: "{}",
    };

    /* ---------------- JWS ---------------- */
    const jws = await generateJWS(payload, process.env.JUSPAY_KID);

    /* ---------------- CALL JUSPAY ---------------- */
    const timestamp = Date.now().toString();

    const response = await axios.post(
      `${process.env.JUSPAY_HOST}/merchants/vpas/validity360`,
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
          "jpupi-routing-id": upiRequestId,
        },
      },
    );

    /* ---------------- RESPONSE ---------------- */
    res.json({
      message: "VPA verification successful",
      upiRequestId,
      juspayResponse: response.data,
    });
  } catch (err) {
    console.error("❌ VERIFY VPA ERROR:", err.response?.data || err.message);

    res.status(500).json({
      message: "Failed to verify VPA",
      error: err.response?.data || err.message,
    });
  }
};
