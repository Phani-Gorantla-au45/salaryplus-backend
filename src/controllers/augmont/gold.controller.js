import axios from "axios";
import qs from "qs";
import Gold from "../../models/gold.model.js";
import RegistrationUser from "../../models/registration.model.js";

export const createGoldAccount = async (req, res) => {
  try {
    if (!req.user?.id) return res.status(401).json({ message: "Unauthorized" });

    const { firstName, lastName, email, userName } = req.body;

    if (!firstName || !lastName || !email || !userName)
      return res.status(400).json({ message: "Missing required fields" });

    // 🔹 Fetch verified user
    const user = await RegistrationUser.findById(req.user.id);
    if (!user?.uniqueId || !user?.stateId || !user?.phone)
      return res.status(400).json({ message: "Complete registration first" });

    // 🔹 Call :contentReference[oaicite:0]{index=0} API
    const response = await axios.post(
      `${process.env.AUG_URL}/merchant/v1/users`,
      qs.stringify({
        uniqueId: user.uniqueId,
        mobileNumber: user.phone,
        emailId: email,
        userName,
        userState: user.stateId, // must be Augmont state ID
      }),
      {
        headers: {
          Authorization: `Bearer ${process.env.AUGMONT_TOKEN}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
      },
    );

    console.log("✅ AUGMONT CREATE USER RESPONSE:", response.data);

    const augData = response.data?.result?.data;

    if (!augData?.customerMappedId)
      throw new Error("Augmont user ID missing in response");

    // 🔹 Save locally with correct Augmont ID
    const goldUser = await Gold.create({
      uniqueId: user.uniqueId,
      firstName,
      lastName,
      email,
      phone: user.phone,
      userState: user.stateId,
      userName,
      augmontUserId: augData.customerMappedId, // ⭐ IMPORTANT FIX
    });

    res.status(201).json({
      message: "Gold account created",
      goldUser,
    });
  } catch (err) {
    console.error("❌ GOLD ERROR:", err.response?.data || err.message);
    res.status(500).json({
      message: "Gold creation failed",
      error: err.response?.data || err.message,
    });
  }
};
