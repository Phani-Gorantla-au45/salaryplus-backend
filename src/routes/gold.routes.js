import express from "express";
import {
  createGoldAccount,
  updateGoldUser,
  getAugmontUserProfile,
  createUserAddress,
  getUserAddressList,
  deleteUserAddress,
} from "../controllers/augmont/gold.controller.js";
import { auth } from "../middlewares/jwt.js";
import { createOrder } from "../controllers/augmont/order.controller.js";
import { getPassbook } from "../controllers/augmont/passbook.controller.js";
const router = express.Router();

router.post("/create", auth, createGoldAccount);
router.put("/update", auth, updateGoldUser);
router.get("/profile", auth, getAugmontUserProfile);
router.post("/add-address", auth, createUserAddress);
router.get("/list", auth, getUserAddressList);
router.delete("/delete/:addressId", auth, deleteUserAddress);
router.post("/ordergold", auth, createOrder);
router.get("getpassbook", auth, getPassbook);
export default router;
