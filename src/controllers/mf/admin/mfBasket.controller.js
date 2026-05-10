import MfBasket from "../../../models/mf/mfBasket.model.js";
import MfSchemePlan from "../../../models/mf/master/mfSchemePlan.model.js";
import { fetchFpSchemePlan } from "../../../utils/mf/master/schemePlan.utils.js";
import { getAmcLogoMap } from "../../../utils/mf/master/amc.utils.js";

const RISK_PROFILES = ["conservative", "moderate", "aggressive"];

/* ------------------------------------------------------------------ */
/*  Internal — resolve scheme from cache or FP, return key fields      */
/* ------------------------------------------------------------------ */
const resolveSchemeForBasket = async (isin) => {
  const upper = isin.toUpperCase().trim();
  let scheme = await MfSchemePlan.findOne({ isin: upper });

  if (!scheme?.syncedAt) {
    const fpData = await fetchFpSchemePlan(upper);
    scheme = await MfSchemePlan.findOneAndUpdate(
      { isin: upper },
      {
        $set: {
          isin:       fpData.isin?.toUpperCase() || upper,
          gateway:    fpData.gateway || "cybrillapoa",
          schemeName: fpData.mf_scheme?.name ?? null,
          fundName:   fpData.mf_fund?.name  ?? null,
          type:       fpData.type,
          option:     fpData.option,
          active:     fpData.active ?? true,
          thresholds: fpData.thresholds ?? [],
          syncedAt:   new Date(),
        },
      },
      { upsert: true, new: true }
    );
  }

  // Extract min lumpsum and min SIP (monthly) from thresholds
  const lumpsumThreshold = scheme.thresholds?.find((t) => t.type === "lumpsum");
  const sipThreshold = scheme.thresholds?.find(
    (t) => t.type === "sip" && (!t.frequency || t.frequency === "monthly")
  );

  return {
    isin:             scheme.isin,
    fundName:         scheme.fundName,
    schemeName:       scheme.schemeName,
    minLumpsumAmount: lumpsumThreshold?.amount_min ?? null,
    minSipAmount:     sipThreshold?.amount_min     ?? null,
    thresholds:       scheme.thresholds ?? [],
  };
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/admin/basket                                           */
/*  Body: { name, description?, riskProfile, funds: [{ isin, contributionPercent }] } */
/* ------------------------------------------------------------------ */
export const createBasket = async (req, res) => {
  try {
    const { name, description, riskProfile, funds, goalType } = req.body;

    /* ---------- VALIDATE ---------- */
    if (!name?.trim()) {
      return res.status(400).json({ success: false, message: "name is required" });
    }
    if (!RISK_PROFILES.includes(riskProfile)) {
      return res.status(400).json({
        success: false,
        message: `riskProfile must be one of: ${RISK_PROFILES.join(", ")}`,
      });
    }
    if (!Array.isArray(funds) || funds.length === 0) {
      return res.status(400).json({ success: false, message: "funds must be a non-empty array" });
    }

    // Validate each fund entry
    for (const f of funds) {
      if (!f.isin) {
        return res.status(400).json({ success: false, message: "Each fund must have an isin" });
      }
      if (typeof f.contributionPercent !== "number" || f.contributionPercent <= 0) {
        return res.status(400).json({
          success: false,
          message: `contributionPercent for ${f.isin} must be a positive number`,
        });
      }
    }

    // Contributions must sum to 100
    const total = funds.reduce((sum, f) => sum + f.contributionPercent, 0);
    if (Math.abs(total - 100) > 0.01) {
      return res.status(400).json({
        success: false,
        message: `Fund contributions must sum to 100%. Current total: ${total}%`,
      });
    }

    /* ---------- AUTO-FETCH FUND DETAILS FROM FP ---------- */
    console.log(`\n🗂️  [ADMIN BASKET] Creating basket "${name}" (${riskProfile}) with ${funds.length} fund(s)...`);

    const resolvedFunds = await Promise.all(
      funds.map(async (f) => {
        console.log(`  Fetching scheme details for ISIN=${f.isin}...`);
        const schemeData = await resolveSchemeForBasket(f.isin);
        console.log(`  ✅ ${f.isin} → ${schemeData.fundName}`);
        return {
          isin:                f.isin.toUpperCase().trim(),
          fundName:            schemeData.fundName,
          schemeName:          schemeData.schemeName,
          contributionPercent: f.contributionPercent,
          minLumpsumAmount:    schemeData.minLumpsumAmount,
          minSipAmount:        schemeData.minSipAmount,
          thresholds:          schemeData.thresholds,
        };
      })
    );

    /* ---------- SAVE ---------- */
    const basket = await MfBasket.create({
      name:                name.trim(),
      description:         description?.trim() ?? null,
      riskProfile,
      goalType:            goalType?.trim()    ?? null,
      funds:               resolvedFunds,
      basketMinInvestment: calcBasketMinInvestment(resolvedFunds),
    });

    console.log(`  ✅ Basket created — id=${basket._id}`);
    const logoMap = await getAmcLogoMap(resolvedFunds.map((f) => f.fundName).filter(Boolean));

    return res.status(201).json({
      success: true,
      message: "Basket created successfully",
      data: basketResponse(basket, logoMap),
    });
  } catch (err) {
    console.error("❌ [ADMIN BASKET] Create error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/admin/basket                                            */
/*  Query: ?riskProfile=conservative&active=true                        */
/* ------------------------------------------------------------------ */
export const listBaskets = async (req, res) => {
  try {
    const filter = {};
    if (req.query.riskProfile) filter.riskProfile = req.query.riskProfile;
    if (req.query.goalType)    filter.goalType    = req.query.goalType;
    if (req.query.active !== undefined) filter.active = req.query.active === "true";

    const baskets = await MfBasket.find(filter).sort({ createdAt: -1 });
    const allFundNames = baskets.flatMap((b) => b.funds.map((f) => f.fundName)).filter(Boolean);
    const logoMap = await getAmcLogoMap(allFundNames);

    return res.status(200).json({
      success: true,
      count:   baskets.length,
      data:    baskets.map((b) => basketResponse(b, logoMap)),
    });
  } catch (err) {
    console.error("❌ [ADMIN BASKET] List error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/admin/basket/:id                                        */
/* ------------------------------------------------------------------ */
export const getBasket = async (req, res) => {
  try {
    const basket = await MfBasket.findById(req.params.id);
    if (!basket) {
      return res.status(404).json({ success: false, message: "Basket not found" });
    }
    const logoMap = await getAmcLogoMap(basket.funds.map((f) => f.fundName).filter(Boolean));
    return res.status(200).json({ success: true, data: basketResponse(basket, logoMap) });
  } catch (err) {
    console.error("❌ [ADMIN BASKET] Get error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  PATCH /api/mf/admin/basket/:id                                      */
/*  Update name, description, active, riskProfile, or re-assign funds  */
/* ------------------------------------------------------------------ */
export const updateBasket = async (req, res) => {
  try {
    const basket = await MfBasket.findById(req.params.id);
    if (!basket) {
      return res.status(404).json({ success: false, message: "Basket not found" });
    }

    const { name, description, riskProfile, active, funds, goalType } = req.body;

    if (name !== undefined)        basket.name        = name.trim();
    if (description !== undefined) basket.description = description?.trim() ?? null;
    if (active !== undefined)      basket.active      = Boolean(active);
    if (goalType !== undefined)    basket.goalType    = goalType?.trim() ?? null;

    if (riskProfile !== undefined) {
      if (!RISK_PROFILES.includes(riskProfile)) {
        return res.status(400).json({
          success: false,
          message: `riskProfile must be one of: ${RISK_PROFILES.join(", ")}`,
        });
      }
      basket.riskProfile = riskProfile;
    }

    if (funds !== undefined) {
      if (!Array.isArray(funds) || funds.length === 0) {
        return res.status(400).json({ success: false, message: "funds must be a non-empty array" });
      }
      for (const f of funds) {
        if (!f.isin || typeof f.contributionPercent !== "number" || f.contributionPercent <= 0) {
          return res.status(400).json({
            success: false,
            message: `Each fund must have isin and a positive contributionPercent`,
          });
        }
      }
      const total = funds.reduce((sum, f) => sum + f.contributionPercent, 0);
      if (Math.abs(total - 100) > 0.01) {
        return res.status(400).json({
          success: false,
          message: `Fund contributions must sum to 100%. Current total: ${total}%`,
        });
      }

      const resolvedFunds = await Promise.all(
        funds.map(async (f) => {
          const schemeData = await resolveSchemeForBasket(f.isin);
          return {
            isin:                f.isin.toUpperCase().trim(),
            fundName:            schemeData.fundName,
            schemeName:          schemeData.schemeName,
            contributionPercent: f.contributionPercent,
            minLumpsumAmount:    schemeData.minLumpsumAmount,
            minSipAmount:        schemeData.minSipAmount,
            thresholds:          schemeData.thresholds,
          };
        })
      );
      basket.funds               = resolvedFunds;
      basket.basketMinInvestment = calcBasketMinInvestment(resolvedFunds);
    }

    await basket.save();
    const logoMap = await getAmcLogoMap(basket.funds.map((f) => f.fundName).filter(Boolean));

    return res.status(200).json({
      success: true,
      message: "Basket updated successfully",
      data: basketResponse(basket, logoMap),
    });
  } catch (err) {
    console.error("❌ [ADMIN BASKET] Update error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/admin/basket/:id/assign                                */
/*  Assign this basket to a specific user for a goal type override.     */
/*  Body: { uniqueId }   — pass null to remove the user assignment      */
/* ------------------------------------------------------------------ */
export const assignBasket = async (req, res) => {
  try {
    const basket = await MfBasket.findById(req.params.id);
    if (!basket) {
      return res.status(404).json({ success: false, message: "Basket not found" });
    }

    const { uniqueId } = req.body;
    basket.assignedUserId = uniqueId ?? null;
    await basket.save();
    const logoMap = await getAmcLogoMap(basket.funds.map((f) => f.fundName).filter(Boolean));

    return res.status(200).json({
      success: true,
      message: uniqueId
        ? `Basket assigned to user ${uniqueId}`
        : "Basket assignment cleared — now visible to all users as default",
      data: basketResponse(basket, logoMap),
    });
  } catch (err) {
    console.error("❌ [ADMIN BASKET] Assign error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  DELETE /api/mf/admin/basket/:id                                     */
/* ------------------------------------------------------------------ */
export const deleteBasket = async (req, res) => {
  try {
    const basket = await MfBasket.findByIdAndDelete(req.params.id);
    if (!basket) {
      return res.status(404).json({ success: false, message: "Basket not found" });
    }
    return res.status(200).json({ success: true, message: "Basket deleted" });
  } catch (err) {
    console.error("❌ [ADMIN BASKET] Delete error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  Internal — calculate minimum total investment for the basket        */
/*  For each fund with a lumpsum min, the total basket investment must  */
/*  be at least (minLumpsumAmount / contributionPercent%) so that fund  */
/*  receives at least its minimum. We take the max across all funds.   */
/* ------------------------------------------------------------------ */
export const calcBasketMinInvestment = (resolvedFunds) => {
  const minimums = resolvedFunds
    .filter((f) => f.minLumpsumAmount && f.contributionPercent > 0)
    .map((f) => f.minLumpsumAmount / (f.contributionPercent / 100));

  if (minimums.length === 0) return null;
  return Math.ceil(Math.max(...minimums));
};

/* ------------------------------------------------------------------ */
/*  Internal — shape response object                                    */
/* ------------------------------------------------------------------ */
const basketResponse = (basket, logoMap = {}) => ({
  id:                  basket._id,
  name:                basket.name,
  description:         basket.description,
  riskProfile:         basket.riskProfile,
  goalType:            basket.goalType      ?? null,
  assignedUserId:      basket.assignedUserId ?? null,
  active:              basket.active,
  basketMinInvestment: basket.basketMinInvestment ?? null,
  funds: basket.funds.map((f) => ({
    isin:                f.isin,
    fundName:            f.fundName,
    schemeName:          f.schemeName,
    contributionPercent: f.contributionPercent,
    minLumpsumAmount:    f.minLumpsumAmount,
    minSipAmount:        f.minSipAmount,
    amcLogo:             logoMap[f.fundName?.toUpperCase()] ?? null,
  })),
  createdAt: basket.createdAt,
  updatedAt: basket.updatedAt,
});
