import MfUserData from "../../../models/mf/mfUserData.model.js";
import {
  fetchFpInvestmentReturns,
  fetchFpSchemeReturns,
} from "../../../utils/mf/reports/returns.utils.js";

/* ------------------------------------------------------------------ */
/*  GET /api/mf/reports/returns                                         */
/*  Returns the investor's investment snapshot:                         */
/*  invested amount, current value, unrealized gain, absolute return,  */
/*  CAGR, XIRR — all via FP investment_account_wise_returns report.    */
/*                                                                      */
/*  No DB writes — FP response is passed through directly.             */
/* ------------------------------------------------------------------ */
export const getInvestmentReturns = async (req, res) => {
  try {
    const { uniqueId } = req.user;

    /* ---------- Get FP investment account id from DB ---------- */
    const mfData = await MfUserData.findOne({ uniqueId });
    const fpInvestmentAccountId =
      mfData?.investmentAccount?.fpInvestmentAccountId;

    if (!fpInvestmentAccountId) {
      return res.status(400).json({
        success: false,
        message: "MF investment account not found. Complete account setup first.",
      });
    }

    /* ---------- traded_on_to = today in IST (UTC+5:30) ---------- */
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    const tradedOnTo = istDate.toISOString().split("T")[0]; // yyyy-MM-dd

    /* ---------- Fetch from FP ---------- */
    const fpResponse = await fetchFpInvestmentReturns(
      fpInvestmentAccountId,
      tradedOnTo
    );

    /* ---------- Parse columns + rows into readable shape ---------- */
    const columns = fpResponse?.data?.columns ?? [];
    const rows = fpResponse?.data?.rows ?? [];

    // Map each row array → object using column names
    const parsed = rows.map((row) =>
      Object.fromEntries(columns.map((col, i) => [col, row[i]]))
    );

    const summary = parsed[0] ?? null;

    return res.status(200).json({
      success: true,
      data: {
        fpInvestmentAccountId,
        asOn: tradedOnTo,
        investedAmount: summary?.invested_amount ?? null,
        currentValue: summary?.current_value ?? null,
        unrealizedGain: summary?.unrealized_gain ?? null,
        absoluteReturn: summary?.absolute_return ?? null,
        cagr: summary?.cagr ?? null,
        xirr: summary?.xirr ?? null,
        raw: fpResponse,
      },
    });
  } catch (err) {
    console.error("❌ [RETURNS REPORT] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/reports/scheme-returns                                  */
/*  Returns scheme-level breakdown of the investor's portfolio:         */
/*  per-scheme ISIN, name, plan type, NAV, invested, current value,    */
/*  units, unrealized gain, absolute return, XIRR.                     */
/*                                                                      */
/*  No DB writes — FP response is passed through directly.             */
/* ------------------------------------------------------------------ */
export const getSchemeReturns = async (req, res) => {
  try {
    const { uniqueId } = req.user;

    /* ---------- Get FP investment account id from DB ---------- */
    const mfData = await MfUserData.findOne({ uniqueId });
    const fpInvestmentAccountId =
      mfData?.investmentAccount?.fpInvestmentAccountId;

    if (!fpInvestmentAccountId) {
      return res.status(400).json({
        success: false,
        message: "MF investment account not found. Complete account setup first.",
      });
    }

    /* ---------- traded_on_to = today in IST (UTC+5:30) ---------- */
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    const tradedOnTo = istDate.toISOString().split("T")[0]; // yyyy-MM-dd

    /* ---------- Fetch from FP ---------- */
    const fpResponse = await fetchFpSchemeReturns(
      fpInvestmentAccountId,
      tradedOnTo
    );

    /* ---------- Parse columns + rows into readable shape ---------- */
    const columns = fpResponse?.data?.columns ?? [];
    const rows = fpResponse?.data?.rows ?? [];

    // Map each row array → named object using column names
    // Note: FP has a trailing space on "current_value " — trim all keys
    const schemes = rows.map((row) =>
      Object.fromEntries(
        columns.map((col, i) => [col.trim(), row[i]])
      )
    );

    return res.status(200).json({
      success: true,
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
        raw: fpResponse,
      },
    });
  } catch (err) {
    console.error("❌ [SCHEME RETURNS REPORT] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
