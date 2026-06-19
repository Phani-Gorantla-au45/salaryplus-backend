import MfUserData from "../../../models/mf/mfUserData.model.js";
import {
  fetchFpInvestmentReturns,
  fetchFpSchemeReturns,
} from "../../../utils/mf/reports/returns.utils.js";

const todayIst = () => {
  const istOffset = 5.5 * 60 * 60 * 1000;
  return new Date(Date.now() + istOffset).toISOString().split("T")[0];
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/admin/returns/:uniqueId                                 */
/*  Admin view of a user's portfolio summary — invested amount,        */
/*  current value, unrealized gain, absolute return, CAGR, XIRR.       */
/* ------------------------------------------------------------------ */
export const getInvestmentReturnsAdmin = async (req, res) => {
  try {
    const { uniqueId } = req.params;

    const mfData = await MfUserData.findOne({ uniqueId });
    const fpInvestmentAccountId = mfData?.investmentAccount?.fpInvestmentAccountId;

    if (!fpInvestmentAccountId) {
      return res.status(400).json({
        success: false,
        message: "MF investment account not found for this user",
      });
    }

    const tradedOnTo = todayIst();
    const fpResponse = await fetchFpInvestmentReturns(fpInvestmentAccountId, tradedOnTo);

    const columns = fpResponse?.data?.columns ?? [];
    const rows    = fpResponse?.data?.rows ?? [];
    const parsed  = rows.map((row) => Object.fromEntries(columns.map((col, i) => [col, row[i]])));
    const summary = parsed[0] ?? null;

    return res.status(200).json({
      success: true,
      uniqueId,
      data: {
        fpInvestmentAccountId,
        asOn: tradedOnTo,
        investedAmount: summary?.invested_amount ?? null,
        currentValue:   summary?.current_value   ?? null,
        unrealizedGain: summary?.unrealized_gain ?? null,
        absoluteReturn: summary?.absolute_return ?? null,
        cagr: summary?.cagr ?? null,
        xirr: summary?.xirr ?? null,
      },
    });
  } catch (err) {
    console.error("❌ [ADMIN RETURNS] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/admin/returns/:uniqueId/schemes                         */
/*  Admin view of a user's scheme-wise portfolio breakdown.             */
/* ------------------------------------------------------------------ */
export const getSchemeReturnsAdmin = async (req, res) => {
  try {
    const { uniqueId } = req.params;

    const mfData = await MfUserData.findOne({ uniqueId });
    const fpInvestmentAccountId = mfData?.investmentAccount?.fpInvestmentAccountId;

    if (!fpInvestmentAccountId) {
      return res.status(400).json({
        success: false,
        message: "MF investment account not found for this user",
      });
    }

    const tradedOnTo = todayIst();
    const fpResponse = await fetchFpSchemeReturns(fpInvestmentAccountId, tradedOnTo);

    const columns = fpResponse?.data?.columns ?? [];
    const rows    = fpResponse?.data?.rows ?? [];
    const schemes = rows.map((row) => Object.fromEntries(columns.map((col, i) => [col.trim(), row[i]])));

    return res.status(200).json({
      success: true,
      uniqueId,
      data: {
        fpInvestmentAccountId,
        asOn: tradedOnTo,
        count: schemes.length,
        schemes: schemes.map((s) => ({
          isin: s.isin,
          schemeName: s.scheme_name,
          planType: s.plan_type,
          investmentOption: s.investment_option,
          nav: s.nav,
          investedAmount: s.invested_amount,
          currentValue: s.current_value,
          units: s.units,
          unrealizedGain: s.unrealized_gain,
          absoluteReturn: s.absolute_return,
          xirr: s.xirr,
        })),
      },
    });
  } catch (err) {
    console.error("❌ [ADMIN SCHEME RETURNS] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
