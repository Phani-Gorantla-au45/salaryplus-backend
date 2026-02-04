import Rates from "../../models/rateModel.js";
import cron from "node-cron";
import axios from "axios";

/* ---------------- CRON JOB (RUNS EVERY 5 MINUTES) ---------------- */
cron.schedule("*/5 * * * *", async () => {
  console.log("⏳ Fetching metal rates from Augmont...");

  try {
    const response = await axios({
      method: "GET",
      url: `${process.env.AUG_URL}/merchant/v1/rates`,
      headers: {
        Authorization: `Bearer ${process.env.AUGMONT_TOKEN}`,
        Accept: "application/json",
      },
    });

    const data = response.data.result?.data;
    const rates = data?.rates;
    const blockId = data?.blockId;

    if (!rates) {
      console.log("⚠️ Rates object missing:", response.data);
      return;
    }

    const gBuy = parseFloat(rates.gBuy);
    const gSell = parseFloat(rates.gSell);
    const sBuy = parseFloat(rates.sBuy);
    const sSell = parseFloat(rates.sSell);

    await Rates.create({ gBuy, gSell, sBuy, sSell, blockId });

    console.log("✅ Rates updated:", gBuy, gSell, sBuy, sSell, blockId);
  } catch (err) {
    console.error("❌ Rate fetch failed:");
    console.error("Status:", err.response?.status);
    console.error("Data:", err.response?.data);
  }
});

/* ---------------- GET RATES API (READ FROM DB) ---------------- */
export const getRates = async (req, res) => {
  try {
    const rate = await Rates.findOne().sort({ updatedAt: -1 });

    if (!rate) {
      return res.status(404).json({ message: "Rates not available" });
    }

    console.log(
      "✅ Rate fetched:",
      rate.gBuy,
      rate.gSell,
      rate.sBuy,
      rate.sSell,
    );

    res.json({
      gBuy: rate.gBuy,
      gSell: rate.gSell,
      sBuy: rate.sBuy,
      sSell: rate.sSell,
      blockId: rate.blockId,
      updatedAt: rate.updatedAt,
    });
  } catch (err) {
    console.error("🔥 Rate API Error:", err);
    res.status(500).json({ message: "Failed to fetch rates" });
  }
};
