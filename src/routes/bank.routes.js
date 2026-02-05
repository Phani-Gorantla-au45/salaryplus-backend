import express from "express";
import {
  addUserBank,
  updateUserBank,
  getUserBanks,
  deleteUserBank,
} from "../controllers/augmont/bank.controller.js";
import { auth } from "../middlewares/jwt.js";
const router = express.Router();

router.post("/add-bank", auth, addUserBank);
router.post("/update-bank/:userBankId", auth, updateUserBank);
router.get("/get-banks", auth, getUserBanks);
router.delete("/delete-bank/:userBankId", auth, deleteUserBank);

export default router;
