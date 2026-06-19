import MfPurchase   from "../../../models/mf/purchase/mfPurchase.model.js";
import MfRedemption from "../../../models/mf/redemption/mfRedemption.model.js";
import MfSchemePlan  from "../../../models/mf/master/mfSchemePlan.model.js";

/* ------------------------------------------------------------------ */
/*  GET /api/mf/admin/transactions/:uniqueId                            */
/*  Admin view of a user's unified purchase + redemption history.      */
/*                                                                      */
/*  Query params:                                                       */
/*    type   — "purchase" | "redemption"  (default: both)              */
/*    status — filter by fpState e.g. "successful"                     */
/*    limit  — default 50, max 200                                      */
/*    page   — 1-indexed, default 1                                     */
/* ------------------------------------------------------------------ */
export const listTransactionsAdmin = async (req, res) => {
  try {
    const { uniqueId } = req.params;
    const { type, status } = req.query;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const page  = Math.max(Number(req.query.page)  || 1, 1);
    const skip  = (page - 1) * limit;

    const fetchPurchases   = !type || type === "purchase";
    const fetchRedemptions = !type || type === "redemption";

    const purchaseFilter   = { uniqueId, ...(status && { fpState: status }) };
    const redemptionFilter = { uniqueId, ...(status && { fpState: status }) };

    const [rawPurchases, rawRedemptions] = await Promise.all([
      fetchPurchases   ? MfPurchase.find(purchaseFilter).sort({ createdAt: -1 }).lean()   : [],
      fetchRedemptions ? MfRedemption.find(redemptionFilter).sort({ createdAt: -1 }).lean() : [],
    ]);

    if (rawRedemptions.length > 0) {
      const isins = [...new Set(rawRedemptions.map((r) => r.isin).filter(Boolean))];
      if (isins.length > 0) {
        const schemes = await MfSchemePlan.find(
          { isin: { $in: isins } },
          { isin: 1, schemeName: 1, fundName: 1 }
        ).lean();
        const schemeMap = Object.fromEntries(schemes.map((s) => [s.isin, s]));
        for (const r of rawRedemptions) {
          if (r.isin && schemeMap[r.isin]) {
            r.schemeName = schemeMap[r.isin].schemeName ?? null;
            r.fundName   = schemeMap[r.isin].fundName   ?? null;
          }
        }
      }
    }

    const purchases = rawPurchases.map((p) => ({
      id:            p._id,
      type:          "purchase",
      isBasket:      p.isBasketOrder ?? false,
      isin:          p.isin          ?? null,
      schemeName:    p.schemeName    ?? null,
      fundName:      p.fundName      ?? null,
      amount:        p.amount,
      fpState:       p.fpState,
      paymentMethod: p.paymentMethod ?? null,
      folioNumber:   p.folioNumber   ?? null,
      funds:         p.isBasketOrder && p.basketFunds?.length
                       ? p.basketFunds.map((f) => ({
                           isin:       f.isin,
                           amount:     f.amount,
                           schemeName: f.schemeName ?? null,
                           fundName:   f.fundName   ?? null,
                         }))
                       : null,
      createdAt: p.createdAt,
    }));

    const redemptions = rawRedemptions.map((r) => ({
      id:            r._id,
      type:          "redemption",
      isBasket:      false,
      isin:          r.isin       ?? null,
      schemeName:    r.schemeName ?? null,
      fundName:      r.fundName   ?? null,
      amount:        r.amount     ?? null,
      units:         r.units      ?? null,
      fpState:       r.fpState,
      folioNumber:   r.folioNumber ?? null,
      funds:         null,
      createdAt: r.createdAt,
    }));

    const merged = [...purchases, ...redemptions]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const total = merged.length;
    const paged = merged.slice(skip, skip + limit);

    return res.status(200).json({
      success: true,
      uniqueId,
      total,
      page,
      limit,
      data: paged,
    });
  } catch (err) {
    console.error("❌ [ADMIN TRANSACTIONS] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
