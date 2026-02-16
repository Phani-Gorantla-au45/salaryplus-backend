import axios from "axios";
import qs from "qs";
import Gold from "../../models/augmont/gold.model.js";
import RegistrationUser from "../../models/registration/registration.model.js";
import { AugmontCity, AugmontState } from "../../models/augmont/state.model.js";
import UserAddress from "../../models/augmont/userAddress.model.js";
export const createGoldAccount = async (req, res) => {
  try {
    if (!req.user?.uniqueId)
      return res.status(401).json({ message: "Unauthorized" });

    const user = await RegistrationUser.findOne({
      uniqueId: req.user.uniqueId,
    });

    if (!user || !user.uniqueId || !user.stateId)
      return res.status(400).json({ message: "Complete registration first" });

    // 🔹 Prevent duplicate gold account creation
    const existingGold = await Gold.findOne({ uniqueId: user.uniqueId });
    if (existingGold) {
      return res.json({
        message: "Gold account already exists",
        goldUser: existingGold,
      });
    }

    // 🔹 Generate username (letters only, no space)
    const userName = (user.First_name + user.Last_name)
      .replace(/[^a-zA-Z]/g, "")
      .trim();

    // 🔹 Call Augmont Create User API
    const response = await axios.post(
      `${process.env.AUG_URL}/merchant/v1/users`,
      qs.stringify({
        uniqueId: user.uniqueId,
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

    console.log("✅ AUGMONT CREATE USER RESPONSE:", response.data);

    const augData = response.data?.result?.data;
    if (!augData?.customerMappedId)
      throw new Error("Augmont user ID missing in response");

    // 🔹 Save Gold user locally
    const goldUser = await Gold.create({
      uniqueId: user.uniqueId,
      firstName: user.First_name,
      lastName: user.Last_name,
      phone: user.phone,
      userState: user.stateId,
      userName,
      augmontUserId: augData.customerMappedId,
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

export const updateGoldUser = async (req, res) => {
  try {
    if (!req.user?.uniqueId)
      return res.status(401).json({ message: "Unauthorized" });

    const { email, userName, userCity, userState, userPincode, dateOfBirth } =
      req.body;
    const cityDoc = await AugmontCity.findOne({
      name: { $regex: `^${req.body.userCity}$`, $options: "i" },
    });
    if (!cityDoc) return res.status(400).json({ message: "Invalid city name" });

    const stateDoc = await AugmontState.findOne({ stateId: cityDoc.stateId });
    if (!stateDoc)
      return res.status(400).json({ message: "State mapping failed" });

    const augmontCityId = cityDoc.cityId;
    const augmontStateId = cityDoc.stateId;

    const regUser = await RegistrationUser.findOne({
      uniqueId: req.user.uniqueId,
    });

    if (!regUser?.uniqueId)
      return res.status(400).json({ message: "Gold account not created" });

    console.log("👤 Updating Augmont user:", regUser.uniqueId);

    // 🔥 STEP 1 — CALL AUGMONT UPDATE API
    const response = await axios.put(
      `${process.env.AUG_URL}/merchant/v1/users/${regUser.uniqueId}`,
      qs.stringify({
        mobileNumber: regUser.phone,
        emailId: email,
        userCity: augmontCityId, // 🔥 ID not name
        userState: augmontStateId,
        userName,
        userPincode,
        dateOfBirth,
      }),
      {
        headers: {
          Authorization: `Bearer ${process.env.AUGMONT_TOKEN}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
      },
    );

    console.log("✅ AUGMONT UPDATE RESPONSE:", response.data);

    // 🔹 STEP 2 — UPDATE LOCAL GOLD ACCOUNT
    await Gold.findOneAndUpdate(
      { uniqueId: regUser.uniqueId },

      {
        userCityName: userCity, // what user entered
        userCityId: augmontCityId, // Augmont ID
        userStateId: augmontStateId,
        userPincode,
        dateOfBirth,
        email,
        userName,
      },
    );

    res.json({
      message: "User profile updated successfully",
      data: response.data,
    });
  } catch (err) {
    console.error("❌ UPDATE USER ERROR:", err.response?.data || err.message);
    res.status(500).json({
      message: "User update failed",
      error: err.response?.data || err.message,
    });
  }
};

export const getAugmontUserProfile = async (req, res) => {
  try {
    if (!req.user?.uniqueId)
      return res.status(401).json({ message: "Unauthorized" });

    const user = await RegistrationUser.findOne({
      uniqueId: req.user.uniqueId,
    });
    if (!user?.uniqueId)
      return res.status(400).json({ message: "User not linked to Augmont" });

    console.log("👤 Fetching profile for:", user.uniqueId);

    const response = await axios.get(
      `${process.env.AUG_URL}/merchant/v1/users/${user.uniqueId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.AUGMONT_TOKEN}`,
          Accept: "application/json",
        },
      },
    );

    const data = response.data.result.data;

    res.json({
      message: "User profile fetched",
      profile: {
        name: data.userName,
        email: data.userEmail,
        dob: data.dateOfBirth,
        gender: data.gender,
        address: data.userAddress,
        city: data.userCity,
        state: data.userState,
        pincode: data.userPincode,
        nomineeName: data.nomineeName,
        nomineeRelation: data.nomineeRelation,
        nomineeDob: data.nomineeDateOfBirth,
        kycStatus: data.kycStatus,
      },
    });
  } catch (err) {
    console.error("❌ GET PROFILE ERROR:", err.response?.data || err.message);
    res.status(500).json({
      message: "Failed to fetch profile",
      error: err.response?.data || err.message,
    });
  }
};

//////user address
export const createUserAddress = async (req, res) => {
  try {
    const { address, pincode } = req.body; // 🔥 ONLY THESE FROM USER

    if (!req.user?.uniqueId)
      return res.status(401).json({ message: "Unauthorized" });

    const user = await RegistrationUser.findOne({
      uniqueId: req.user.uniqueId,
    });

    const goldUser = await Gold.findOne({
      uniqueId: user.uniqueId, // ✅ CORRECT
    });

    if (!goldUser)
      return res.status(400).json({ message: "Gold account not created" });
    if (!user?.uniqueId)
      return res.status(400).json({ message: "User not linked" });

    if (!address || !pincode)
      return res.status(400).json({ message: "Address & pincode required" });

    console.log("🏠 Creating address for:", user.uniqueId);

    // 🔹 CALL AUGMONT (NO CITY)
    const response = await axios.post(
      `${process.env.AUG_URL}/merchant/v1/users/${user.uniqueId}/address`,
      qs.stringify({
        name: goldUser.userName, // from DB
        mobileNumber: user.phone, // from DB
        email: user.email, // from DB
        address,
        state: user.stateId, // Augmont stateId
        pincode,
      }),
      {
        headers: {
          Authorization: `Bearer ${process.env.AUGMONT_TOKEN}`,
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );

    const data = response.data.result.data;

    console.log("✅ AUG ADDRESS RESPONSE:", data);

    // 🔹 SAVE LOCALLY
    const savedAddress = await UserAddress.create({
      uniqueId: user.uniqueId,
      augmontAddressId: data.userAddressId,
      name: user.userName,
      mobileNumber: user.phone,
      email: user.email,
      address,
      stateId: user.stateId,
      pincode,
      status: data.status.toUpperCase(),
    });

    res.json({
      message: "Address saved successfully",
      address: savedAddress,
    });
  } catch (err) {
    console.error("❌ ADDRESS ERROR:", err.response?.data || err.message);
    res.status(500).json({
      message: "Address creation failed",
      error: err.response?.data || err.message,
    });
  }
};
export const getUserAddressList = async (req, res) => {
  try {
    if (!req.user?.uniqueId)
      return res.status(401).json({ message: "Unauthorized" });

    const user = await RegistrationUser.findOne({
      uniqueId: req.user.uniqueId,
    });

    if (!user?.uniqueId)
      return res.status(400).json({ message: "User not linked" });

    console.log("📦 Fetching address list for:", user.uniqueId);

    // 🔹 CALL AUGMONT
    const response = await axios.get(
      `${process.env.AUG_URL}/merchant/v1/users/${user.uniqueId}/address`,
      {
        headers: {
          Authorization: `Bearer ${process.env.AUGMONT_TOKEN}`,
          Accept: "application/json",
        },
      },
    );

    // 🔥 SAFE EXTRACTION
    const addresses = Array.isArray(response.data.result)
      ? response.data.result
      : response.data.result?.data || [];

    console.log("📦 ADDRESSES COUNT:", addresses.length);

    // 🔹 SYNC DB
    for (const addr of addresses) {
      await UserAddress.updateOne(
        { augmontAddressId: addr.userAddressId },
        {
          UniqueId: user.uniqueId,

          augmontAddressId: addr.userAddressId,
          name: addr.name,
          email: addr.email,
          address: addr.address,
          stateId: addr.stateId,
          cityId: addr.cityId || null,
          pincode: addr.pincode,
          status: addr.status.toUpperCase(),
        },
        { upsert: true },
      );
    }

    res.json({
      message: "User address list fetched successfully",
      addresses,
    });
  } catch (err) {
    console.error("❌ ADDRESS LIST ERROR:", err.response?.data || err.message);
    res.status(500).json({
      message: "Failed to fetch address list",
      error: err.response?.data || err.message,
    });
  }
};
export const deleteUserAddress = async (req, res) => {
  try {
    const { addressId } = req.params;
    if (!req.user?.uniqueId)
      return res.status(401).json({ message: "Unauthorized" });

    const user = await RegistrationUser.findOne({
      uniqueId: req.user.uniqueId,
    });

    if (!user?.uniqueId)
      return res.status(400).json({ message: "User not linked" });

    if (!addressId)
      return res.status(400).json({ message: "Address ID required" });

    console.log("🗑️ Deleting address:", addressId);

    // 🔥 CALL AUGMONT DELETE API
    const response = await axios.delete(
      `${process.env.AUG_URL}/merchant/v1/users/${user.uniqueId}/address/${addressId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.AUGMONT_TOKEN}`,
          Accept: "application/json",
        },
      },
    );

    console.log("✅ AUG DELETE RESPONSE:", response.data);

    // 🔹 DELETE FROM LOCAL DB
    await UserAddress.deleteOne({
      augmontAddressId: addressId,
      userUniqueId: user.uniqueId,
    });

    res.json({
      message: "Address deleted successfully",
      data: response.data,
    });
  } catch (err) {
    console.error(
      "❌ ADDRESS DELETE ERROR:",
      err.response?.data || err.message,
    );
    res.status(500).json({
      message: "Address delete failed",
      error: err.response?.data || err.message,
    });
  }
};
