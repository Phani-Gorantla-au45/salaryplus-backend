import { fetchFpTransactions } from "../../../utils/mf/reports/transactions.utils.js";

/* ------------------------------------------------------------------ */
/*  GET /api/mf/reports/transactions?folios=FOLIO123                   */
/*                                                                      */
/*  Lists all transactions for given folio(s) from FP.                 */
/*  Sorted by transaction date descending (FP default).                */
/*                                                                      */
/*  Query params:                                                       */
/*    folios  — required, comma-separated folio numbers                */
/*    types   — optional, comma-separated transaction types            */
/*    from    — optional, yyyy-MM-dd                                   */
/*    to      — optional, yyyy-MM-dd                                   */
/* ------------------------------------------------------------------ */
export const getTransactions = async (req, res) => {
  try {
    const { folios, types, from, to } = req.query;

    if (!folios) {
      return res.status(400).json({
        success: false,
        message: "folios is required (comma-separated folio numbers)",
      });
    }

    const params = { folios };
    if (types) params.types = types;
    if (from)  params.from  = from;
    if (to)    params.to    = to;

    const fpResponse = await fetchFpTransactions(params);

    return res.status(200).json({
      success: true,
      data: fpResponse,
    });
  } catch (err) {
    console.error("❌ [TRANSACTIONS REPORT] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
