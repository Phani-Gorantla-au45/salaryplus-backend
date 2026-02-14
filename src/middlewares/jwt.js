import jwt from "jsonwebtoken";
import RegistrationUser from "../models/registration.model.js";

export const auth = async (req, res, next) => {
  let decoded;

  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "No token" });

    decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await RegistrationUser.findOne({
      uniqueId: decoded.uniqueId,
    });

    if (!user) return res.status(401).json({ message: "User not found" });

    req.user = { uniqueId: user.uniqueId };
    next();
  } catch (err) {
    res.status(401).json({ message: "Unauthorized" });
  }
};
