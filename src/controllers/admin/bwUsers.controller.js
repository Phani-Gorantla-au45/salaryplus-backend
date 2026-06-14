import RegistrationUser from "../../models/user/user.model.js";
import BwBondKyc from "../../models/bonds/bwBondKyc.model.js";

/* ================================================================
 * GET ALL BW USERS
 * GET /api/bw/admin/users
 *
 * Query params (all optional):
 *   bondKycStatus  – PENDING | SUBMITTED | APPROVED | REJECTED
 *   search         – partial match on phone, name, email, PAN
 *   page           – default 1
 *   limit          – default 20, max 100
 * ================================================================ */
export const getAllBwUsers = async (req, res) => {
  try {
    const { bondKycStatus, search, page = 1, limit = 20 } = req.query;

    const filter = {};

    if (bondKycStatus) {
      filter.bondKycStatus = bondKycStatus.toUpperCase();
    }

    if (search) {
      const regex = new RegExp(search.trim(), "i");
      filter.$or = [
        { phone: regex },
        { First_name: regex },
        { Last_name: regex },
        { email: regex },
        { panNumber: regex },
      ];
    }

    const pageNum  = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));
    const skip     = (pageNum - 1) * limitNum;

    const [users, total] = await Promise.all([
      RegistrationUser.find(filter, {
        _id:           0,
        uniqueId:      1,
        First_name:    1,
        Last_name:     1,
        phone:         1,
        email:         1,
        panNumber:     1,
        bondKycStatus: 1,
        mfKycStatus:   1,
        mfAccount:     1,
        isVerified:    1,
        createdAt:     1,
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      RegistrationUser.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      total,
      page:  pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
      data:  users,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ================================================================
 * GET SINGLE BW USER WITH BOND KYC DETAILS
 * GET /api/bw/admin/users/:uniqueId
 * ================================================================ */
export const getBwUser = async (req, res) => {
  try {
    const { uniqueId } = req.params;

    const [user, bondKyc] = await Promise.all([
      RegistrationUser.findOne({ uniqueId }, { _id: 0, otp: 0, otpExpiry: 0, stateId: 0 }).lean(),
      BwBondKyc.findOne({ userUniqueId: uniqueId }, { _id: 0 }).lean(),
    ]);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...user,
        bondKyc: bondKyc || null,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
