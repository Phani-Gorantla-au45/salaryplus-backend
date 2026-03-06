import MfUserData from "../../../models/mf/mfUserData.model.js";
import { fetchFpHoldings } from "../../../utils/mf/reports/holdings.utils.js";

/* ------------------------------------------------------------------ */
/*  GET /api/mf/reports/holdings                                        */
/*  Fetches the holdings report for the authenticated user's            */
/*  FP investment account and returns the raw FP response.             */
/*                                                                      */
/*  Query Parameters (all optional):                                    */
/*    folios  — comma-separated folio numbers                          */
/*    as_on   — date in yyyy-MM-dd format                              */
/* ------------------------------------------------------------------ */
export const getHoldings = async (req, res) => {
  try {
    const { uniqueId } = req.user;

    /* ---------- Get FP investment account id ---------- */
    // Select +investmentAccount.rawResponse explicitly (select:false by default)
    // for existing users whose fpInvestmentAccountOldId wasn't backfilled yet.
    const mfData = await MfUserData.findOne({ uniqueId }).select(
      "+investmentAccount.rawResponse"
    );
    const fpInvestmentAccountOldId =
      mfData?.investmentAccount?.fpInvestmentAccountOldId ??
      mfData?.investmentAccount?.rawResponse?.old_id;

    if (!fpInvestmentAccountOldId) {
      return res.status(400).json({
        success: false,
        message:
          "MF investment account not found. Complete account setup first.",
      });
    }

    /* ---------- Build optional FP query params ---------- */
    const params = {};
    if (req.query.folios) params.folios = req.query.folios;
    if (req.query.as_on) params.as_on = req.query.as_on;

    /* ---------- Fetch from FP ---------- */
    const fpResponse = await fetchFpHoldings(fpInvestmentAccountOldId, params);

    return res.status(200).json({
      success: true,
      data: fpResponse,
    });
  } catch (err) {
    console.error("❌ [HOLDINGS REPORT] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
