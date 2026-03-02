import Rates from "../../models/gold/rate.model.js";
import cron from "node-cron";
import axios from "axios";
import { emitRatesUpdate } from "../../utils/socket.js";

/* ---------------- CRON JOB (RUNS EVERY 5 MINUTES) ---------------- */
cron.schedule("*/5 * * * *", async () => {
  console.log("⏳ Fetching metal rates from Augmont...");

  try {
    const response = await axios.get(
      `${process.env.AUG_URL}/merchant/v1/rates`,
      {
        headers: {
          Authorization: `Bearer ${process.env.AUGMONT_TOKEN}`,
          Accept: "application/json",
        },
      },
    );

    const data = response.data?.result?.data;
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

    // 🔥 Update single document (or create if not exists)
    const updatedRate = await Rates.findOneAndUpdate(
      {},
      {
        gBuy,
        gSell,
        sBuy,
        sSell,
        blockId,
        updatedAt: new Date(),
      },
      {
        new: true,
        upsert: true,
      },
    );

    // 🔥 EMIT SOCKET EVENT (LIVE RATES)
    emitRatesUpdate({
      gBuy,
      gSell,
      sBuy,
      sSell,
      blockId,
      updatedAt: updatedRate.updatedAt,
    });
    console.log("✅ Rates updated:", gBuy, gSell, sBuy, sSell, blockId);
    console.log("✅ Rates updated & socket emitted");
  } catch (err) {
    console.error("❌ Rate fetch failed:", err.response?.data || err.message);
  }
});

/* ---------------- GET RATES API ---------------- */
export const getRates = async (req, res) => {
  try {
    const rate = await Rates.findOne();

    if (!rate) {
      return res.status(404).json({ message: "Rates not available" });
    }

    return res.json({
      gBuy: rate.gBuy,
      gSell: rate.gSell,
      sBuy: rate.sBuy,
      sSell: rate.sSell,
      blockId: rate.blockId,
      updatedAt: rate.updatedAt,
    });
  } catch (err) {
    console.error("🔥 Rate API Error:", err);
    return res.status(500).json({ message: "Failed to fetch rates" });
  }
};
