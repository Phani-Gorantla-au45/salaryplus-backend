import { fetchFpFolios } from "../../../utils/mf/folio.utils.js";

/* ------------------------------------------------------------------ */
/*  GET /api/mf/admin/folios                                            */
/*  Fetches all MF folios from FP and returns the raw FP response.     */
/*                                                                      */
/*  Query params (all optional):                                        */
/*    folio_number          — filter by folio number                   */
/*    mf_investment_account — filter by FP investment account id       */
/* ------------------------------------------------------------------ */
export const listFolios = async (req, res) => {
  try {
    const { folio_number, mf_investment_account } = req.query;
    const params = {};
    if (folio_number) params.folio_number = folio_number;
    if (mf_investment_account) params.mf_investment_account = mf_investment_account;

    const fpResponse = await fetchFpFolios(params);

    return res.status(200).json({
      success: true,
      data: fpResponse,
    });
  } catch (err) {
    console.error("❌ [ADMIN FOLIOS] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
