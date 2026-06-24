import MfPurchase from "../../../models/mf/purchase/mfPurchase.model.js";
import RegistrationUser from "../../../models/user/user.model.js";
import { fetchFpPurchase } from "../../../utils/mf/purchase/purchase.utils.js";

/* ------------------------------------------------------------------ */
/*  GET /api/mf/admin/purchase/:id                                      */
/*  Admin view of a single purchase's status — refreshes from FP,      */
/*  same as the user-facing GET /api/mf/purchase/:id but without the    */
/*  uniqueId ownership restriction.                                     */
/*                                                                      */
/*  :id = our MongoDB _id for the MfPurchase record (not FP's mfp_xxx) */
/* ------------------------------------------------------------------ */
export const getPurchaseAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    const record = await MfPurchase.findById(id);
    if (!record) {
      return res.status(404).json({ success: false, message: "Purchase not found" });
    }

    // Refresh state from FP — non-fatal if it fails, fall back to cached state
    try {
      const fpData = await fetchFpPurchase(record.fpPurchaseId);
      record.fpState = fpData.state;
      record.rawPurchaseResponse = fpData;
      await record.save();
    } catch (err) {
      console.warn(`⚠️  [ADMIN PURCHASE] FP refresh failed for ${record.fpPurchaseId}, returning cached state:`, err.message);
    }

    const user = await RegistrationUser.findOne(
      { uniqueId: record.uniqueId },
      { First_name: 1, Last_name: 1, phone: 1, email: 1 },
    ).lean();

    return res.status(200).json({
      success: true,
      data: {
        ...record.toObject(),
        user: user
          ? {
              uniqueId: record.uniqueId,
              name:  [user.First_name, user.Last_name].filter(Boolean).join(" ") || null,
              phone: user.phone ?? null,
              email: user.email ?? null,
            }
          : null,
      },
    });
  } catch (err) {
    console.error("❌ [ADMIN PURCHASE] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
