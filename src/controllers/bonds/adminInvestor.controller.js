import SBregister from "../../models/bonds/SBregister.model.js";
import crypto from "crypto";

/* 🆔 Generate Unique ID */
const generateUniqueId = () => {
  const timePart = Date.now().toString(36);
  const randomPart = crypto.randomBytes(5).toString("hex");
  return "SB" + timePart + randomPart;
};

/* =========================
   1️⃣ ADMIN ADD INVESTOR
========================= */
export const addInvestor = async (req, res) => {
  try {
    const { phone, fullName, email } = req.body;

    if (!phone || !fullName || !email) {
      return res.status(400).json({
        success: false,
        message: "phone, fullName and email are required",
      });
    }

    const exists = await SBregister.findOne({ phone });
    if (exists) {
      return res.status(409).json({
        success: false,
        message: "Investor already exists",
      });
    }

    const investor = await SBregister.create({
      phone,
      fullName,
      email,
      uniqueId: generateUniqueId(),
      isVerified: true,
      isActive: true,
      createdBy: "ADMIN",
      kycStatus: "PENDING",
    });

    return res.status(201).json({
      success: true,
      message: "Investor added successfully",
      data: investor,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to add investor",
    });
  }
};

/* =========================
   2️⃣ ADMIN EDIT INVESTOR
========================= */
export const editInvestor = async (req, res) => {
  try {
    const { uniqueId } = req.params;
    const { phone, fullName, email, isActive } = req.body;

    const investor = await SBregister.findOne({ uniqueId });
    if (!investor) {
      return res.status(404).json({
        success: false,
        message: "Investor not found",
      });
    }

    if (phone) investor.phone = phone;
    if (fullName) investor.fullName = fullName;
    if (email) investor.email = email;
    if (typeof isActive === "boolean") investor.isActive = isActive;

    await investor.save();

    return res.status(200).json({
      success: true,
      message: "Investor updated successfully",
      data: investor,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to update investor",
    });
  }
};

/* =========================
   3️⃣ ADMIN DELETE INVESTOR (SOFT)
========================= */
export const deleteInvestor = async (req, res) => {
  try {
    const { uniqueId } = req.params;

    const investor = await SBregister.findOne({ uniqueId });
    if (!investor) {
      return res.status(404).json({
        success: false,
        message: "Investor not found",
      });
    }

    investor.isActive = false;
    await investor.save();

    return res.status(200).json({
      success: true,
      message: "Investor deactivated successfully",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to delete investor",
    });
  }
};
/* =========================
   4️⃣ ADMIN GET ALL INVESTORS
========================= */
export const getAllInvestors = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const { search, status } = req.query;

    const filter = {};

    // 🔍 Search by name, phone or email
    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    // ✅ Active / Inactive filter
    if (status === "active") filter.isActive = true;
    if (status === "inactive") filter.isActive = false;

    const total = await SBregister.countDocuments(filter);

    const investors = await SBregister.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select(
        "uniqueId fullName phone email kycStatus isActive createdBy createdAt",
      );

    return res.status(200).json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      data: investors,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch investors",
    });
  }
};
