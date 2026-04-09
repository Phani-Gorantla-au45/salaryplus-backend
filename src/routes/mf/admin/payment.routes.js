import express from "express";
import { adminAuth } from "../../../middlewares/adminAuth.middleware.js";
import { fetchFpPayment } from "../../../utils/mf/purchase/purchase.utils.js";

const router = express.Router();

// GET /api/mf/admin/payments/:id  →  GET /api/pg/payments/:id on FP
router.get("/:id", adminAuth, async (req, res) => {
  try {
    const data = await fetchFpPayment(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
