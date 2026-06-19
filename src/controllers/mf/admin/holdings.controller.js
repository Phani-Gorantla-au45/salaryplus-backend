import MfUserData from "../../../models/mf/mfUserData.model.js";
import { fetchFpHoldings } from "../../../utils/mf/reports/holdings.utils.js";

/* ------------------------------------------------------------------ */
/*  GET /api/mf/admin/holdings/:uniqueId                                */
/*  Admin view of a user's MF holdings (folio-wise units + value).     */
/*                                                                      */
/*  Query params (all optional):                                       */
/*    folios  — comma-separated folio numbers                          */
/*    as_on   — date in yyyy-MM-dd format                              */
/* ------------------------------------------------------------------ */
export const getHoldingsAdmin = async (req, res) => {
  try {
    const { uniqueId } = req.params;

    const mfData = await MfUserData.findOne({ uniqueId }).select(
      "+investmentAccount.rawResponse"
    );
    const fpInvestmentAccountOldId =
      mfData?.investmentAccount?.fpInvestmentAccountOldId ??
      mfData?.investmentAccount?.rawResponse?.old_id;

    if (!fpInvestmentAccountOldId) {
      return res.status(400).json({
        success: false,
        message: "MF investment account not found for this user",
      });
    }

    const params = {};
    if (req.query.folios) params.folios = req.query.folios;
    if (req.query.as_on)  params.as_on  = req.query.as_on;

    const fpResponse = await fetchFpHoldings(fpInvestmentAccountOldId, params);

    return res.status(200).json({
      success: true,
      uniqueId,
      data: fpResponse,
    });
  } catch (err) {
    console.error("❌ [ADMIN HOLDINGS] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
