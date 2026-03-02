import axios from "axios";
import qs from "qs";
import Bank from "../../models/gold/bank.model.js";
import RegistrationUser from "../../models/user/user.model.js";

export const addUserBank = async (req, res) => {
  try {
    const { accountNumber, accountHolderName, ifscCode } = req.body;

    if (!accountNumber || !accountHolderName || !ifscCode)
      return res.status(400).json({ message: "All bank fields required" });

    if (!req.user?.uniqueId)
      return res.status(401).json({ message: "Unauthorized" });

    const user = await RegistrationUser.findOne({
      uniqueId: req.user.uniqueId,
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    // 🔹 Call Augmont
    const response = await axios.post(
      `${process.env.AUG_URL}/merchant/v1/users/${user.uniqueId}/banks`,
      qs.stringify({
        accountNumber,
        accountName: accountHolderName,
        ifscCode,
        status: "active",
      }),
      {
        headers: {
          Authorization: `Bearer ${process.env.AUGMONT_TOKEN}`,
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );

    const augmontBankId = response.data.result?.data?.userBankId;

    if (!augmontBankId)
      return res
        .status(400)
        .json({ message: "Failed to link bank with Augmont" });

    // 🔒 IMPORTANT: deactivate old banks
    await Bank.updateMany(
      { uniqueId: user.uniqueId, status: "ACTIVE" },
      { status: "INACTIVE" },
    );

    const bank = await Bank.create({
      uniqueId: user.uniqueId,
      accountHolderName,
      accountNumber,
      ifscCode,
      augmontBankId,
      status: "ACTIVE",
    });

    res.json({ message: "Bank added successfully", bank });
  } catch (err) {
    console.error("❌ BANK ERROR:", err.response?.data || err.message);
    res.status(500).json({
      message: "Bank linking failed",
      error: err.response?.data || err.message,
    });
  }
};

export const updateUserBank = async (req, res) => {
  try {
    const { userBankId } = req.params;
    const { accountNumber, accountHolderName, ifscCode } = req.body;

    if (!accountNumber || !accountHolderName || !ifscCode)
      return res.status(400).json({ message: "All bank fields required" });

    if (!req.user?.uniqueId)
      return res.status(401).json({ message: "Unauthorized" });

    const user = await RegistrationUser.findOne({
      uniqueId: req.user.uniqueId,
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    console.log("🏦 Updating Augmont Bank:", {
      uniqueId: user.uniqueId,
      userBankId,
      accountNumber,
    });

    // 🔥 STEP 1 — CALL AUGMONT
    const augRes = await axios.post(
      `${process.env.AUG_URL}/merchant/v1/users/${user.uniqueId}/banks/${userBankId}`,
      qs.stringify({
        accountNumber,
        accountName: accountHolderName,
        ifscCode,
        status: "active",
        _method: "PUT",
      }),
      {
        headers: {
          Authorization: `Bearer ${process.env.AUGMONT_TOKEN}`,
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );

    console.log("✅ AUGMONT UPDATE SUCCESS:", augRes.data);

    // 🔥 STEP 2 — UPDATE LOCAL DB
    const updatedBank = await Bank.findOneAndUpdate(
      { augmontBankId: userBankId, uniqueId: user.uniqueId },
      {
        accountHolderName,
        accountNumber,
        ifscCode,
        status: "ACTIVE",
      },
      { new: true },
    );

    res.json({
      message: "Bank updated successfully",
      augmont: augRes.data,
      local: updatedBank || null,
    });
  } catch (err) {
    console.error("❌ BANK UPDATE ERROR:", err.response?.data || err.message);

    res.status(500).json({
      message: "Bank update failed",
      error: err.response?.data || err.message,
    });
  }
};

export const getUserBanks = async (req, res) => {
  try {
    if (!req.user?.uniqueId)
      return res.status(401).json({ message: "Unauthorized" });

    const user = await RegistrationUser.findOne({
      uniqueId: req.user.uniqueId,
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    console.log("🔎 Fetching banks for:", user.uniqueId);

    const response = await axios.get(
      `${process.env.AUG_URL}/merchant/v1/users/${user.uniqueId}/banks`,
      {
        headers: {
          Authorization: `Bearer ${process.env.AUGMONT_TOKEN}`,
          Accept: "application/json",
        },
      },
    );

    console.log("🏦 BANK LIST RESPONSE:", response.data);

    res.json({
      message: "User banks fetched",
      data: response.data,
    });
  } catch (err) {
    console.error("❌ BANK LIST ERROR:", err.response?.data || err.message);
    res.status(500).json({
      message: "Failed to fetch banks",
      error: err.response?.data || err.message,
    });
  }
};

export const deleteUserBank = async (req, res) => {
  try {
    const { userBankId } = req.params;

    if (!req.user?.uniqueId)
      return res.status(401).json({ message: "Unauthorized" });

    const user = await RegistrationUser.findOne({
      uniqueId: req.user.uniqueId,
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    // 🔥 Call Augmont DELETE API
    const response = await axios.delete(
      `${process.env.AUG_URL}/merchant/v1/users/${user.uniqueId}/banks/${userBankId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.AUGMONT_TOKEN}`,
          Accept: "application/json",
        },
      },
    );

    console.log("🗑️ AUGMONT DELETE BANK RESPONSE:", response.data);

    // 🔹 Remove from local DB
    await Bank.deleteOne({
      augmontBankId: userBankId,
      uniqueId: user.uniqueId,
    });

    res.json({
      message: "Bank deleted successfully",
      data: response.data,
    });
  } catch (err) {
    console.error("❌ DELETE BANK ERROR:", err.response?.data || err.message);
    res.status(500).json({
      message: "Bank deletion failed",
      error: err.response?.data || err.message,
    });
  }
};
