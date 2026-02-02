import axios from "axios";
import State from "./state.model.js";

export const syncStates = async (req, res) => {
  try {
    const response = await axios.get(
      "https://uat-api.augmontgold.com/api/merchant/v1/master/states",
      {
        params: { count: 100, page: 1 },
        headers: {
          Authorization: `Bearer ${process.env.AUGMONT_TOKEN}`,
          Accept: "application/json",
        },
      },
    );

    console.log("FULL RESPONSE:", response.data);

    const states = response.data.result.data;

    for (const s of states) {
      await State.updateOne(
        { stateId: s.id },
        { name: s.name },
        { upsert: true },
      );
    }

    res.json({ message: "States synced to DB" });
  } catch (err) {
    console.error("SYNC ERROR:", err.response?.data || err.message);
    res.status(500).json({ message: "Sync failed", error: err.message });
  }
};

export const getStatesFromDB = async (req, res) => {
  const states = await State.find().sort({ name: 1 });
  res.json(states);
};
