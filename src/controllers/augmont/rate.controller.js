import Rates from "../../models/rateModel.js";
import cron from "node-cron";
import axios from "axios";

/* ---------------- CRON JOB (RUNS EVERY 5 MINUTES) ---------------- */
cron.schedule("*/5 * * * *", async () => {
  console.log("⏳ Fetching metal rates from Augmont...");

  try {
    const response = await axios({
      method: "GET",
      url: `${process.env.AUG_URL}/merchant/v1/rates`, // should end with /merchant/v1/rates
      headers: {
        Authorization: `Bearer ${process.env.AUGMONT_TOKEN}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    const data = response.data;

    const rates = data.result?.data?.rates;

    if (!rates) {
      console.log("⚠️ Rates object missing:", data);
      return;
    }

    const goldRate = parseFloat(rates.gBuy);
    const silverRate = parseFloat(rates.sBuy);

    await Rates.create({ goldRate, silverRate });

    console.log("✅ Rates updated:", goldRate, silverRate);
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
      console.log("❌ No rates found in DB at", new Date().toISOString());
      return res.status(404).json({ message: "Rates not available" });
    }

    console.log("✅ Rate fetched:", rate.goldRate, rate.silverRate);

    res.json({
      goldRate: rate.goldRate,
      silverRate: rate.silverRate,
      updatedAt: rate.updatedAt,
    });
  } catch (err) {
    console.error("🔥 Rate API Error:", err);
    res.status(500).json({ message: "Failed to fetch rates" });
  }
};
