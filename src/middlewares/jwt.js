import jwt from "jsonwebtoken";
import RegistrationUser from "../models/registration.model.js";

export const auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "No token" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await RegistrationUser.findById(decoded.id);
    next();
  } catch {
    res.status(401).json({ message: "Unauthorized" });
  }
};
