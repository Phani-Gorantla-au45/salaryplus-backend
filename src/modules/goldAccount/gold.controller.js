import axios from "axios";
import qs from "qs";
import Gold from "./gold.model.js";
import RegistrationUser from "../registration/registration.model.js";

export const createGoldAccount = async (req, res) => {
  try {
    if (!req.user?.id) return res.status(401).json({ message: "Unauthorized" });

    const { firstName, lastName, email, userName } = req.body;

    if (!firstName || !lastName || !email || !userName)
      return res.status(400).json({ message: "Missing required fields" });

    // 🔥 Trusted data from DB
    const user = await RegistrationUser.findById(req.user.id);

    if (!user?.uniqueId || !user?.stateId || !user?.phone)
      return res.status(400).json({ message: "Complete registration first" });

    // 🔥 Augmont API call
    const response = await axios.post(
      process.env.AUG_URL,
      qs.stringify({
        uniqueId: user.uniqueId,
        mobileNumber: user.phone,
        emailId: email,
        userName,
        userState: user.stateId,
      }),
      {
        headers: {
          Authorization: `Bearer ${process.env.AUGMONT_TOKEN}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
      },
    );

    // 🔥 Save locally
    const goldUser = await Gold.create({
      uniqueId: user.uniqueId,
      firstName,
      lastName,
      email,
      phone: user.phone,
      userState: user.stateId,
      userName,
      augmontUserId: response.data.result?.userId,
    });

    res.status(201).json({ message: "Gold account created", goldUser });
  } catch (err) {
    console.error("GOLD ERROR:", err.response?.data || err.message);
    res.status(500).json({ message: "Gold creation failed" });
  }
};
