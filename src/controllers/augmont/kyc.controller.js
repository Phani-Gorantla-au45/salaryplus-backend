import axios from "axios";
import Kyc from "../../models/kyc.model.js";
import { v4 as uuidv4 } from "uuid";
export const verifyPan = async (req, res) => {
  try {
    const { pan } = req.body;
    const user = req.user;

    if (!pan || !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan.toUpperCase()))
      return res.status(400).json({ message: "Invalid PAN format" });

    const response = await axios.post(
      `${process.env.CASHFREE_URL}/verification/pan`,
      { pan: pan.toUpperCase() },
      {
        headers: {
          "x-client-id": process.env.CASHFREE_PAN_CLIENT_ID,
          "x-client-secret": process.env.CASHFREE_PAN_CLIENT_SECRET,
          "x-api-version": "2022-10-26",
          "Content-Type": "application/json",
        },
      },
    );

    const data = response.data;

    if (!data.valid || data.pan_status !== "VALID") {
      return res.status(400).json({
        message: "PAN verification failed",
        details: data.message,
      });
    }

    // Save KYC locally linked with UUID
    await Kyc.findOneAndUpdate(
      { userId: user._id },
      {
        userId: user._id,
        uniqueId: user.uniqueId,
        panNumber: data.pan,
        panType: data.type,
        referenceId: data.reference_id,
        panVerified: true,
        verifiedAt: new Date(),
      },
      { upsert: true, new: true },
    );

    // Quick flag in user table
    user.panVerified = true;
    await user.save();

    res.json({
      message: "PAN verified and stored locally",
      panType: data.type,
      aadhaarStatus: data.aadhaar_seeding_status_desc,
    });
  } catch (err) {
    console.log("CASHFREE ERROR FULL:", err.response?.data);
    console.log("STATUS:", err.response?.status);
    console.log("HEADERS SENT:", {
      id: process.env.CASHFREE_CLIENT_ID,
      secret: process.env.CASHFREE_SECRET_KEY,
    });
    res.status(500).json({ message: "PAN verification failed" });
  }
};
export const verifyfullPan = async (req, res) => {
  try {
    const { pan, name, dob } = req.body;

    // 🔍 Validations
    if (!pan || !name || !dob)
      return res.status(400).json({ message: "pan, name, dob required" });

    const verification_id = uuidv4().slice(0, 12); // <= 50 chars

    const response = await axios.post(
      "https://sandbox.cashfree.com/verification/pan-lite",
      {
        verification_id,
        pan,
        name,
        dob,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-client-id": process.env.CASHFREE_CLIENT_ID,
          "x-client-secret": process.env.CASHFREE_CLIENT_SECRET,
        },
      },
    );

    const data = response.data;

    res.json({
      message: "PAN verification result",
      panStatus: data.pan_status,
      nameMatch: data.name_match,
      dobMatch: data.dob_match,
      aadhaarLinked: data.aadhaar_seeding_status,
      fullResponse: data,
    });
  } catch (err) {
    console.error("PAN ERROR:", err.response?.data || err.message);
    res.status(500).json({ message: "PAN verification failed" });
  }
};
