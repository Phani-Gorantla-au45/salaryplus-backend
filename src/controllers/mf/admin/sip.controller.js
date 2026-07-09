import { listFpSips, fetchFpSip, cancelFpSip } from "../../../utils/mf/sip/sip.utils.js";
import MfSip from "../../../models/mf/sip/mfSip.model.js";
import MfUserData from "../../../models/mf/mfUserData.model.js";

const VALID_CANCELLATION_CODES = [
  "amount_not_available",
  "investment_returns_not_as_expected",
  "exit_load_not_as_expected",
  "switch_to_other_scheme",
  "fund_manager_changed",
  "investment_goal_complete",
  "mandate_not_ready",
  "invest_later",
  "customer_support_not_satisfactory",
  "amc_support_not_satisfactory",
  "custom_reason",
];

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

/* ------------------------------------------------------------------ */
/*  POST /api/mf/admin/sip/:fpSipId/cancel                              */
/*  Admin-initiated cancel. Handles both single and basket SIPs.        */
/*  For basket SIPs, cancels every individual plan.                     */
/*                                                                      */
/*  Body: {                                                              */
/*    cancellation_code   — one of VALID_CANCELLATION_CODES             */
/*    cancellation_reason — required only when code = "custom_reason"   */
/*  }                                                                    */
/* ------------------------------------------------------------------ */
export const cancelSipAdmin = async (req, res) => {
  try {
    const { fpSipId } = req.params;
    const { cancellation_code, cancellation_reason } = req.body;

    /* ---------- VALIDATE ---------- */
    if (!cancellation_code || !VALID_CANCELLATION_CODES.includes(cancellation_code)) {
      return res.status(400).json({
        success: false,
        message: `cancellation_code is required. Allowed values: ${VALID_CANCELLATION_CODES.join(", ")}`,
      });
    }
    if (cancellation_code === "custom_reason" && !cancellation_reason) {
      return res.status(400).json({
        success: false,
        message: "cancellation_reason is required when cancellation_code is 'custom_reason'",
      });
    }

    /* ---------- LOOK UP OUR DB RECORD ---------- */
    const sipRecord = await MfSip.findOne({
      $or: [{ fpSipId }, { "basketPlans.fpSipId": fpSipId }],
    });

    /* ---------- DETERMINE PLAN IDs TO CANCEL ---------- */
    // Basket: cancel every individual plan; single: cancel the one plan
    let planIds;
    if (sipRecord?.isBasketSip && sipRecord.basketPlans?.length) {
      planIds = sipRecord.basketPlans.map((p) => p.fpSipId).filter(Boolean);
    } else {
      planIds = [fpSipId];
    }

    /* ---------- CANCEL ON FP ---------- */
    const results = [];
    const errors  = [];

    for (const id of planIds) {
      try {
        const fpData = await cancelFpSip(id, cancellation_code, cancellation_reason ?? null);
        results.push({ fpSipId: id, state: fpData.state });
      } catch (planErr) {
        console.error(`❌ [ADMIN SIP CANCEL] Plan ${id} failed:`, planErr.message);
        errors.push({ fpSipId: id, error: planErr.message });
      }
    }

    /* ---------- UPDATE OUR DB ---------- */
    if (sipRecord && results.length > 0) {
      const dbUpdate = { fpState: "cancelled" };
      if (sipRecord.isBasketSip) {
        // Mark each cancelled basket plan
        const cancelledIds = new Set(results.map((r) => r.fpSipId));
        sipRecord.basketPlans.forEach((p) => {
          if (cancelledIds.has(p.fpSipId)) p.fpState = "cancelled";
        });
        dbUpdate.basketPlans = sipRecord.basketPlans;
      }
      await MfSip.updateOne({ _id: sipRecord._id }, { $set: dbUpdate });
    }

    const allFailed = results.length === 0;
    const partialFailure = errors.length > 0 && results.length > 0;

    return res.status(allFailed ? 502 : 200).json({
      success: !allFailed,
      message: allFailed
        ? "All cancel requests failed on FP"
        : partialFailure
          ? `Partially cancelled — ${results.length} succeeded, ${errors.length} failed`
          : `SIP cancelled successfully (${results.length} plan${results.length > 1 ? "s" : ""})`,
      cancelled: results,
      ...(errors.length && { errors }),
    });
  } catch (err) {
    console.error("❌ [ADMIN SIP CANCEL] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
