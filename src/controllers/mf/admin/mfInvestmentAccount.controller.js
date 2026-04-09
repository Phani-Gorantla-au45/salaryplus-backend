import { listFpMfInvestmentAccounts, fetchFpMfInvestmentAccount } from "../../../utils/mf/onboarding/mfInvestmentAccount.utils.js";
import MfUserData from "../../../models/mf/mfUserData.model.js";

/* ------------------------------------------------------------------ */
/*  GET /api/mf/admin/investment-accounts                               */
/*  Query: ?uniqueId=xxx  OR  nothing to get all                       */
/* ------------------------------------------------------------------ */
export const listInvestmentAccounts = async (req, res) => {
  try {
    const { uniqueId } = req.query;

    if (uniqueId) {
      const mfData = await MfUserData.findOne({ uniqueId }).select("investmentAccount").lean();
      const accountId = mfData?.investmentAccount?.fpInvestmentAccountId;
      if (!accountId) {
        return res.status(404).json({ success: false, message: `No investment account found for uniqueId: ${uniqueId}` });
      }
      const data = await fetchFpMfInvestmentAccount(accountId);
      return res.json({ success: true, data });
    }

    const data = await listFpMfInvestmentAccounts();
    return res.json({ success: true, data });
  } catch (err) {
    console.error("❌ [ADMIN MF ACCOUNT] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
