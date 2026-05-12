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

/* ------------------------------------------------------------------ */
/*  GET /api/mf/admin/folios/by-pan?pan=XXXXX                          */
/*  Fetches all folios from FP and returns folio numbers matching PAN. */
/*  Checks primary, secondary, and third investor PANs.                */
/* ------------------------------------------------------------------ */
export const foliosByPan = async (req, res) => {
  try {
    const { pan } = req.query;
    if (!pan) {
      return res.status(400).json({ success: false, message: "pan query parameter is required" });
    }

    const panUpper = pan.trim().toUpperCase();
    const fpResponse = await fetchFpFolios();
    const allFolios = fpResponse?.data ?? [];

    const matched = allFolios
      .filter((f) =>
        [f.primary_investor_pan, f.secondary_investor_pan, f.third_investor_pan]
          .some((p) => p && p.trim().toUpperCase() === panUpper)
      )
      .map((f) => f.number);

    return res.status(200).json({
      success: true,
      pan: panUpper,
      count: matched.length,
      folioNumbers: matched,
    });
  } catch (err) {
    console.error("❌ [ADMIN FOLIOS BY PAN] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
