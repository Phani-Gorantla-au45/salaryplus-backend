import { fetchFpAumSummary } from "../../../utils/mf/reports/aum.utils.js";

const todayIst = () => {
  const istOffset = 5.5 * 60 * 60 * 1000;
  return new Date(Date.now() + istOffset).toISOString().split("T")[0];
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/admin/aum                                               */
/*  Admin view of total AUM broken down by fund category               */
/*  (equity / debt / liquid / others) across all investors.            */
/*                                                                      */
/*  Query params (all optional):                                       */
/*    partner         — ARN/RIA code                                   */
/*    traded_on_from  — yyyy-MM-dd (default: since inception)          */
/*    traded_on_to    — yyyy-MM-dd (default: today)                    */
/* ------------------------------------------------------------------ */
export const getAumSummaryAdmin = async (req, res) => {
  try {
    const { partner, traded_on_from } = req.query;
    const traded_on_to = req.query.traded_on_to || todayIst();

    const params = { traded_on_to };
    if (partner)        params.partner        = partner;
    if (traded_on_from) params.traded_on_from = traded_on_from;

    const fpResponse = await fetchFpAumSummary(params);

    const columns = fpResponse?.data?.columns ?? [];
    const rows    = fpResponse?.data?.rows ?? [];
    const parsed  = rows.map((row) => Object.fromEntries(columns.map((col, i) => [col, row[i]])));

    const byCategory = {};
    let totalAum = 0;
    for (const r of parsed) {
      byCategory[r.fund_category] = r.value;
      totalAum += Number(r.value) || 0;
    }

    return res.status(200).json({
      success: true,
      data: {
        totalAum:  Math.round(totalAum * 100) / 100,
        byCategory,
        breakdown: parsed.map((r) => ({ fundCategory: r.fund_category, value: r.value })),
        filters:   fpResponse?.filter_by ?? { partner: partner ?? null, traded_on_from: traded_on_from ?? null, traded_on_to },
      },
    });
  } catch (err) {
    console.error("❌ [ADMIN AUM] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
