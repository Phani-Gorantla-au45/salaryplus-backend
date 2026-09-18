import { fetchFpTransactions } from "../../../utils/mf/reports/transactions.utils.js";
import MfUserData from "../../../models/mf/mfUserData.model.js";
import { fetchFpTransactionListReport } from "../../../utils/mf/reports/listReports.utils.js";

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

/* ------------------------------------------------------------------ */
/*  GET /api/mf/reports/transactions/rta                               */
/*                                                                      */
/*  RTA-level transaction ledger for the authenticated user.           */
/*  PAN is always resolved from our DB — user never supplies it.       */
/*                                                                      */
/*  Query params (all optional):                                        */
/*    folio_number    — narrow to a specific folio                     */
/*    traded_on_from  — yyyy-MM-dd                                     */
/*    traded_on_to    — yyyy-MM-dd                                     */
/* ------------------------------------------------------------------ */
export const getUserRtaTransactions = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { folio_number, traded_on_from, traded_on_to } = req.query;

    // Always resolve PAN from DB — user should never need to supply it
    const userData = await MfUserData.findOne(
      { uniqueId },
      { "investorProfile.pan": 1 }
    ).lean();

    const pan = userData?.investorProfile?.pan ?? null;
    if (!pan) {
      return res.status(404).json({ success: false, message: "PAN not found — complete your KYC first" });
    }

    const payload = { pan_number: pan };
    if (folio_number)   payload.folio_number   = folio_number;
    if (traded_on_from) payload.traded_on_from = traded_on_from;
    if (traded_on_to)   payload.traded_on_to   = traded_on_to;

    const fpResponse = await fetchFpTransactionListReport(payload);
    const columns = fpResponse?.data?.columns ?? [];
    const rows    = fpResponse?.data?.rows    ?? [];
    const parsed  = rows.map((row) => Object.fromEntries(columns.map((col, i) => [col, row[i]])));

    return res.status(200).json({
      success: true,
      count: parsed.length,
      data: parsed,
    });
  } catch (err) {
    console.error("❌ [USER RTA TXN REPORT] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
