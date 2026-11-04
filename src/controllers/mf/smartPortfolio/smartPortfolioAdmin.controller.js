import SmartPortfolioConfig from "../../../models/mf/smartPortfolio/smartPortfolioProfile.model.js";
import UserSmartPortfolio   from "../../../models/mf/smartPortfolio/userSmartPortfolio.model.js";
import MfUserData            from "../../../models/mf/mfUserData.model.js";

const TAG = "[SMART-PORTFOLIO ADMIN]";

const SINGLETON_KEY = "default";

const getOrCreateConfig = async () => {
  const cfg = await SmartPortfolioConfig.findOneAndUpdate(
    { key: SINGLETON_KEY },
    { $setOnInsert: { key: SINGLETON_KEY } },
    { upsert: true, new: true }
  );
  return cfg;
};

const validateFundWeights = (funds, label) => {
  const active = funds.filter((f) => f.isActive !== false);
  if (!active.length) return;
  const sum = active.reduce((acc, f) => acc + (f.weight ?? 0), 0);
  if (Math.round(sum) !== 100) {
    throw new Error(`${label} active fund weights must sum to 100, got ${sum}`);
  }
};

const validateFormula = (formula, label) => {
  const { equity, debt, gold } = formula;
  const baseSum = (equity.base ?? 0) + (debt.base ?? 0) + (gold.base ?? 0);
  const multSum = (equity.ageMultiplier ?? 0) + (debt.ageMultiplier ?? 0) + (gold.ageMultiplier ?? 0);
  if (Math.round(baseSum) !== 100) {
    throw new Error(`${label} formula: equity.base + debt.base + gold.base must equal 100, got ${baseSum}`);
  }
  if (multSum !== 0) {
    throw new Error(`${label} formula: ageMultipliers must sum to 0, got ${multSum} (so allocations always total 100% at any age)`);
  }
};

/* ── Shared allocation engine ────────────────────── */
export const computeAllocation = (age, riskLevel, cfg) => {
  const f = cfg.formula?.[riskLevel];

  // Fall back to hardcoded defaults if formula not in DB yet
  const eq = f?.equity ?? (riskLevel === "high" ? { base: 70, ageMultiplier: 0 } : { base: 100, ageMultiplier: -1 });
  const db = f?.debt   ?? (riskLevel === "high" ? { base: 20, ageMultiplier: 0 } : { base: -10, ageMultiplier:  1 });
  const gl = f?.gold   ?? { base: 10, ageMultiplier: 0 };

  const calc = (slot) => Math.max(slot.minPercent ?? 0, (slot.base ?? 0) + (slot.ageMultiplier ?? 0) * age);

  let equityPct = calc(eq);
  let debtPct   = calc(db);
  let goldPct   = calc(gl);

  // Normalise in case minPercent floors caused the sum to exceed 100
  const total = equityPct + debtPct + goldPct;
  if (total !== 100) {
    const scale = 100 / total;
    equityPct = Math.round(equityPct * scale);
    debtPct   = Math.round(debtPct   * scale);
    goldPct   = 100 - equityPct - debtPct;
  }

  const funds = [];
  const addFunds = (bucket, assetClass, bucketPct) => {
    const active = (bucket ?? []).filter((f) => f.isActive !== false);
    for (const f of active) {
      funds.push({
        isin:       f.isin,
        fundName:   f.fundName,
        amcName:    f.amcName ?? null,
        assetClass,
        weight:     (bucketPct * f.weight) / 100,
        amount:     null,
      });
    }
  };

  addFunds(cfg.equity, "equity", equityPct);
  addFunds(cfg.debt,   "debt",   debtPct);
  addFunds(cfg.gold,   "gold",   goldPct);

  return {
    allocation: { equity: equityPct, debt: debtPct, gold: goldPct },
    funds,
  };
};

/* ====================================================================
 *  GET /api/mf/admin/smart-portfolio/config
 * ==================================================================== */
export const getConfig = async (req, res) => {
  try {
    const cfg = await getOrCreateConfig();
    return res.json({ success: true, data: cfg });
  } catch (err) {
    console.error(`${TAG} getConfig:`, err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ====================================================================
 *  POST /api/mf/admin/smart-portfolio/config
 *  Update funds for one or more asset classes.
 *  Body: { equity?, debt?, gold? }  — arrays of fund objects
 * ==================================================================== */
export const updateConfig = async (req, res) => {
  try {
    const { equity, debt, gold } = req.body;
    if (!equity && !debt && !gold) {
      return res.status(400).json({ success: false, message: "Provide at least one asset class (equity, debt, gold)" });
    }

    if (equity) validateFundWeights(equity, "equity");
    if (debt)   validateFundWeights(debt,   "debt");
    if (gold)   validateFundWeights(gold,   "gold");

    const cfg = await getOrCreateConfig();
    if (equity) { cfg.equity = equity; cfg.markModified("equity"); }
    if (debt)   { cfg.debt   = debt;   cfg.markModified("debt");   }
    if (gold)   { cfg.gold   = gold;   cfg.markModified("gold");   }

    await cfg.save();
    console.log(`${TAG} updateConfig — ${[equity && "equity", debt && "debt", gold && "gold"].filter(Boolean).join(", ")}`);
    return res.json({ success: true, message: "Fund config updated", data: cfg });
  } catch (err) {
    console.error(`${TAG} updateConfig:`, err.message);
    return res.status(400).json({ success: false, message: err.message });
  }
};

/* ====================================================================
 *  POST /api/mf/admin/smart-portfolio/formula
 *  Update allocation formula for moderate and/or high risk level.
 *  Body: { moderate?, high? }
 *  Each: { equity: { base, ageMultiplier, minPercent }, debt: {...}, gold: {...} }
 *
 *  Validation:
 *    base values must sum to 100
 *    ageMultipliers must sum to 0  (so allocation always totals 100% at any age)
 * ==================================================================== */
export const updateFormula = async (req, res) => {
  try {
    const { moderate, high } = req.body;
    if (!moderate && !high) {
      return res.status(400).json({ success: false, message: "Provide at least one risk level (moderate, high)" });
    }

    if (moderate) validateFormula(moderate, "moderate");
    if (high)     validateFormula(high,     "high");

    const cfg = await getOrCreateConfig();
    if (!cfg.formula) cfg.formula = {};

    if (moderate) { cfg.formula.moderate = moderate; }
    if (high)     { cfg.formula.high     = high;     }
    cfg.markModified("formula");
    await cfg.save();

    console.log(`${TAG} updateFormula — ${[moderate && "moderate", high && "high"].filter(Boolean).join(", ")}`);
    return res.json({ success: true, message: "Formula updated", data: cfg.formula });
  } catch (err) {
    console.error(`${TAG} updateFormula:`, err.message);
    return res.status(400).json({ success: false, message: err.message });
  }
};

/* ====================================================================
 *  GET /api/mf/admin/smart-portfolio/users
 * ==================================================================== */
export const listUserPortfolios = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const skip = (Number(page) - 1) * Number(limit);
    const [portfolios, total] = await Promise.all([
      UserSmartPortfolio.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      UserSmartPortfolio.countDocuments(filter),
    ]);

    const uniqueIds = portfolios.map((p) => p.uniqueId);
    const userData  = await MfUserData.find({ uniqueId: { $in: uniqueIds } }, "uniqueId phone pan").lean();
    const userMap   = Object.fromEntries(userData.map((u) => [u.uniqueId, u]));

    const enriched = portfolios.map((p) => ({
      ...p,
      phone: userMap[p.uniqueId]?.phone ?? null,
      pan:   userMap[p.uniqueId]?.pan   ?? null,
    }));

    return res.json({ success: true, total, page: Number(page), data: enriched });
  } catch (err) {
    console.error(`${TAG} listUserPortfolios:`, err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ====================================================================
 *  GET /api/mf/admin/smart-portfolio/users/:uniqueId
 * ==================================================================== */
export const getUserPortfolio = async (req, res) => {
  try {
    const portfolio = await UserSmartPortfolio.findOne({ uniqueId: req.params.uniqueId }).lean();
    if (!portfolio) return res.status(404).json({ success: false, message: "No portfolio found" });
    return res.json({ success: true, data: portfolio });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ====================================================================
 *  POST /api/mf/admin/smart-portfolio/assign
 *  Body: { uniqueId, age, riskLevel: "moderate"|"high", note? }
 * ==================================================================== */
export const assignPortfolio = async (req, res) => {
  try {
    const { uniqueId, age, riskLevel, note } = req.body;
    if (!uniqueId || !age || !riskLevel) {
      return res.status(400).json({ success: false, message: "uniqueId, age, riskLevel required" });
    }
    if (!["moderate", "high"].includes(riskLevel)) {
      return res.status(400).json({ success: false, message: "riskLevel must be 'moderate' or 'high'" });
    }

    const cfg = await SmartPortfolioConfig.findOne({ key: SINGLETON_KEY }).lean();
    if (!cfg) return res.status(503).json({ success: false, message: "Smart Portfolio not configured yet" });

    const { allocation, funds } = computeAllocation(Number(age), riskLevel, cfg);

    const portfolio = await UserSmartPortfolio.findOneAndUpdate(
      { uniqueId },
      {
        uniqueId,
        riskLevel,
        inputs: { age: Number(age) },
        allocation,
        funds,
        status: "saved",
        investmentType: null,
        linkedOrderIds: [],
        linkedSipId: null,
        assignedByAdmin: true,
        adminNote: note ?? null,
      },
      { upsert: true, new: true }
    );

    console.log(`${TAG} assignPortfolio — ${uniqueId} age:${age} risk:${riskLevel}`);
    return res.json({ success: true, message: "Portfolio assigned", data: portfolio });
  } catch (err) {
    console.error(`${TAG} assignPortfolio:`, err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
