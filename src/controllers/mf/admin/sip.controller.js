import { listFpSips, fetchFpSip } from "../../../utils/mf/sip/sip.utils.js";
import MfUserData from "../../../models/mf/mfUserData.model.js";

/* ------------------------------------------------------------------ */
/*  GET /api/mf/admin/sip                                               */
/*  Proxies GET /v2/mf_purchase_plans to FP with optional filters.     */
/*                                                                      */
/*  Query params (all optional):                                        */
/*    mf_investment_account  — FP investment account id (mfia_xxx)     */
/*    states                 — comma-separated states e.g. active,created */
/*    uniqueId               — our user id (we resolve mfia from DB)   */
/* ------------------------------------------------------------------ */
export const listSipsAdmin = async (req, res) => {
  try {
    let { mf_investment_account, states, uniqueId } = req.query;

    // Allow passing our uniqueId — resolve mfia automatically
    if (!mf_investment_account && uniqueId) {
      const mfData = await MfUserData.findOne({ uniqueId })
        .select("investmentAccount")
        .lean();
      mf_investment_account = mfData?.investmentAccount?.fpInvestmentAccountId;
      if (!mf_investment_account) {
        return res.status(404).json({
          success: false,
          message: `No MF investment account found for uniqueId: ${uniqueId}`,
        });
      }
    }

    const params = {};
    if (mf_investment_account) params.mf_investment_account = mf_investment_account;
    if (states) params.states = states;

    const fpResponse = await listFpSips(params);

    // FP always returns { object: "list", data: [...] }
    const allPlans = Array.isArray(fpResponse) ? fpResponse : (fpResponse?.data || []);

    // Always filter on our side — FP doesn't reliably honour the states param
    const filtered = states
      ? allPlans.filter((plan) => states.split(",").map((s) => s.trim()).includes(plan.state))
      : allPlans;

    /* ---------- ATTACH OUR USER INFO (resolve FP account → our user) ---------- */
    const fpAccountIds = [...new Set(filtered.map((p) => p.mf_investment_account).filter(Boolean))];

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

    const enriched = filtered.map((plan) => ({
      ...plan,
      user: userByFpAccount[plan.mf_investment_account] ?? null,
    }));

    return res.status(200).json({ success: true, count: enriched.length, data: enriched });
  } catch (err) {
    console.error("❌ [ADMIN SIP LIST] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/admin/sip/:fpSipId                                      */
/*  Fetches a single SIP plan directly from FP by its FP id.           */
/* ------------------------------------------------------------------ */
export const getSipAdmin = async (req, res) => {
  try {
    const { fpSipId } = req.params;
    const fpResponse = await fetchFpSip(fpSipId);

    let user = null;
    if (fpResponse?.mf_investment_account) {
      const u = await MfUserData.findOne(
        { "investmentAccount.fpInvestmentAccountId": fpResponse.mf_investment_account },
        {
          uniqueId: 1,
          "investorProfile.name": 1,
          "investorProfile.pan": 1,
          "phone.number": 1,
          "email.email": 1,
        },
      ).lean();

      if (u) {
        user = {
          uniqueId: u.uniqueId,
          name:     u.investorProfile?.name ?? null,
          pan:      u.investorProfile?.pan  ?? null,
          phone:    u.phone?.number ?? null,
          email:    u.email?.email  ?? null,
        };
      }
    }

    return res.status(200).json({ success: true, data: { ...fpResponse, user } });
  } catch (err) {
    console.error("❌ [ADMIN SIP GET] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
