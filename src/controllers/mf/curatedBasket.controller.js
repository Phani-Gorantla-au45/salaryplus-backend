import MfBasket from "../../models/mf/mfBasket.model.js";

/* ------------------------------------------------------------------ */
/*  GET /api/mf/curated-basket                                          */
/*  Lists all active curated baskets for display to end users.          */
/*  Query: ?riskProfile=conservative|moderate|aggressive                */
/* ------------------------------------------------------------------ */
export const listCuratedBaskets = async (req, res) => {
  try {
    const uniqueId     = req.user?.uniqueId ?? null;
    const { riskProfile, goalType } = req.query;

    const baseFilter = { active: true };
    if (riskProfile) baseFilter.riskProfile = riskProfile;
    if (goalType)    baseFilter.goalType    = goalType;

    let baskets;

    if (uniqueId && goalType) {
      // Try user-specific basket first, fall back to default
      const userBasket = await MfBasket.findOne({
        ...baseFilter,
        assignedUserId: uniqueId,
      });

      if (userBasket) {
        baskets = [userBasket];
      } else {
        baskets = await MfBasket.find({
          ...baseFilter,
          assignedUserId: null,
        }).sort({ riskProfile: 1 });
      }
    } else {
      // No goal context — return all default baskets matching filter
      baskets = await MfBasket.find({
        ...baseFilter,
        assignedUserId: null,
      }).sort({ riskProfile: 1, goalType: 1 });
    }

    return res.status(200).json({
      success: true,
      count: baskets.length,
      data: baskets.map(basketPublicResponse),
    });
  } catch (err) {
    console.error("❌ [CURATED BASKET] List error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/curated-basket/:id                                      */
/*  Get a single curated basket by MongoDB _id.                         */
/* ------------------------------------------------------------------ */
export const getCuratedBasket = async (req, res) => {
  try {
    const basket = await MfBasket.findOne({ _id: req.params.id, active: true });
    if (!basket) {
      return res
        .status(404)
        .json({ success: false, message: "Basket not found" });
    }

    return res.status(200).json({
      success: true,
      data: basketPublicResponse(basket),
    });
  } catch (err) {
    console.error("❌ [CURATED BASKET] Get error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  Internal — public-facing response shape (no raw thresholds)         */
/* ------------------------------------------------------------------ */
const basketPublicResponse = (basket) => ({
  id: basket._id,
  name: basket.name,
  description: basket.description,
  riskProfile: basket.riskProfile,
  goalType: basket.goalType ?? null,
  basketMinInvestment: basket.basketMinInvestment ?? null,
  funds: basket.funds.map((f) => ({
    isin: f.isin,
    fundName: f.fundName,
    schemeName: f.schemeName,
    contributionPercent: f.contributionPercent,
    minLumpsumAmount: f.minLumpsumAmount,
    minSipAmount: f.minSipAmount,
  })),
});
