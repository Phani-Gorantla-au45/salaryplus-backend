import jwt from "jsonwebtoken";
import User from "../models/registration/registration.model.js";
import SBregister from "../models/bonds/SBregister.model.js";

export const auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { uniqueId } = decoded;

    // 1️⃣ Check main User table
    let user = await User.findOne({ uniqueId });

    // 2️⃣ If not found, check SBregister
    if (!user) {
      user = await SBregister.findOne({ uniqueId });
    }

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    // 3️⃣ Attach minimal identity
    req.user = {
      uniqueId: user.uniqueId,
    };

    next();
  } catch (err) {
    return res.status(401).json({ message: "Unauthorized" });
  }
};
