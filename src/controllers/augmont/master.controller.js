import axios from "axios";
import { AugmontState, AugmontCity } from "../../models/state.model.js"; // ✅ CHANGED

/* ---------------- SYNC STATES FROM AUGMONT ---------------- */
export const syncStates = async (req, res) => {
  try {
    const endpoint = "/merchant/v1/master/states";
    const url = `${process.env.AUG_URL}${endpoint}`;

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
      return res.status(404).json({ message: "No states received" });
    }

    const bulkOps = states.map((s) => ({
      updateOne: {
        filter: { stateId: s.id },
        update: { stateId: s.id, name: s.name }, // ✅ CHANGED (added stateId in update)
        upsert: true,
      },
    }));

    await AugmontState.bulkWrite(bulkOps); // ✅ CHANGED

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
    const states = await AugmontState.find().sort({ name: 1 }); // ✅ CHANGED
    res.json(states);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch states" });
  }
};

/* ---------------- SYNC CITIES FROM AUGMONT ---------------- */
export const syncCities = async (req, res) => {
  try {
    const { stateId } = req.query;

    if (!stateId) {
      return res.status(400).json({ message: "stateId is required" });
    }

    const endpoint = "/merchant/v1/master/cities";
    const url = `${process.env.AUG_URL}${endpoint}`;
    console.log("AUG_URL =", process.env.AUG_URL);
    console.log("FINAL URL =", url);
    console.log("🏙 Fetching cities for state:", stateId);

    const response = await axios.get(url, {
      params: { stateId, count: 100, page: 1 },
      headers: {
        Authorization: `Bearer ${process.env.AUGMONT_TOKEN}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    const cities = response.data?.result?.data;

    if (!cities || !cities.length) {
      return res.status(404).json({ message: "No cities received" });
    }

    const bulkOps = cities.map((c) => ({
      updateOne: {
        filter: { cityId: c.id },
        update: {
          cityId: c.id, // ✅ CHANGED (important)
          name: c.name,
          stateId: c.stateId,
        },
        upsert: true,
      },
    }));

    await AugmontCity.bulkWrite(bulkOps); // ✅ CHANGED

    console.log(`✅ ${cities.length} cities synced`);
    res.json({ message: "Cities synced successfully", count: cities.length });
  } catch (err) {
    console.error("❌ CITY SYNC ERROR:", err.response?.data || err.message);
    res.status(500).json({ message: "City sync failed", error: err.message });
  }
};
/* ---------------- GET CITIES FROM DB ---------------- */
export const getCitiesFromDB = async (req, res) => {
  try {
    const { stateId } = req.query;

    const filter = stateId ? { stateId } : {};
    const cities = await AugmontCity.find(filter).sort({ name: 1 });

    res.json(cities);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch cities" });
  }
};
