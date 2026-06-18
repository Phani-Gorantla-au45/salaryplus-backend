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

    const fpResponse = await listFpMfInvestmentAccounts();
    const accounts = fpResponse?.data ?? [];

    /* ---------- ATTACH OUR USER INFO (resolve FP account id → our user) ---------- */
    const fpAccountIds = [...new Set(accounts.map((a) => a.id).filter(Boolean))];

    const users = await MfUserData.find(
      { "investmentAccount.fpInvestmentAccountId": { $in: fpAccountIds } },
      {
        uniqueId: 1,
        "investmentAccount.fpInvestmentAccountId": 1,
        "investorProfile.name": 1,
        "investorProfile.pan": 1,
        "phone.number": 1,
        "email.email": 1,
      },
    ).lean();

    const userByFpAccount = {};
    for (const u of users) {
      userByFpAccount[u.investmentAccount?.fpInvestmentAccountId] = {
        uniqueId: u.uniqueId,
        name:     u.investorProfile?.name ?? null,
        pan:      u.investorProfile?.pan  ?? null,
        phone:    u.phone?.number ?? null,
        email:    u.email?.email  ?? null,
      };
    }

    const enriched = accounts.map((a) => ({ ...a, user: userByFpAccount[a.id] ?? null }));

    return res.json({ success: true, count: enriched.length, data: enriched });
  } catch (err) {
    console.error("❌ [ADMIN MF ACCOUNT] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
