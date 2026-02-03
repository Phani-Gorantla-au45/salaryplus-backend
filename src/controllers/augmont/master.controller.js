import axios from "axios";
import State from "../../models/state.model.js";

/* ---------------- SYNC STATES FROM AUGMONT ---------------- */
export const syncStates = async (req, res) => {
  try {
    const endpoint = "/merchant/v1/master/states";
    const url = `${process.env.AUG_BASE_URL}${endpoint}`;

    console.log("🌍 Fetching states from:", url);

    const response = await axios.get(url, {
      params: { count: 100, page: 1 },
      headers: {
        Authorization: `Bearer ${process.env.AUGMONT_TOKEN}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    const states = response.data?.result?.data;

    if (!states || !states.length) {
      console.log("⚠️ No states returned from API");
      return res.status(404).json({ message: "No states received" });
    }

    // ⚡ Bulk DB operation (faster than loop)
    const bulkOps = states.map((s) => ({
      updateOne: {
        filter: { stateId: s.id },
        update: { name: s.name },
        upsert: true,
      },
    }));

    await State.bulkWrite(bulkOps);

    console.log(`✅ ${states.length} states synced`);

    res.json({ message: "States synced successfully", count: states.length });
  } catch (err) {
    console.error("❌ SYNC ERROR:", err.response?.data || err.message);
    res.status(500).json({ message: "Sync failed", error: err.message });
  }
};

/* ---------------- GET STATES FROM DB ---------------- */
export const getStatesFromDB = async (req, res) => {
  try {
    const states = await State.find().sort({ name: 1 });
    res.json(states);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch states" });
  }
};
