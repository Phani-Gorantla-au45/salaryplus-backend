import SmartPortfolioConfig from "../../../models/mf/smartPortfolio/smartPortfolioProfile.model.js";
import UserSmartPortfolio   from "../../../models/mf/smartPortfolio/userSmartPortfolio.model.js";
import { computeAllocation, attachSchemeMinimums, calcPortfolioMinimums } from "./smartPortfolioAdmin.controller.js";
import { VARIANTS, configKey, isConfigured, normalizeVariant, variantMeta, variantOf } from "./smartPortfolioVariants.js";

/* Load the config for a variant; null if it isn't enabled / configured for users. */
const loadUsableConfig = async (variant) => {
  const cfg  = await SmartPortfolioConfig.findOne({ key: configKey(variant) }).lean();
  const meta = variantMeta(variant, cfg);
  if (!meta.isEnabled || !isConfigured(cfg)) return { cfg: null, meta };
  return { cfg, meta };
};

const TAG = "[SMART-PORTFOLIO]";

/* --------------------------------------------------------------------
 *  Ensure every fund carries minLumpsumAmount / minSipAmount and the
 *  portfolio carries minLumpsumInvestment / minSipInvestment.
 *  Minimums normally come from the admin config (resolved on save, like
 *  curated baskets). Funds still missing them (config saved before this
 *  feature, or old user snapshots) are resolved from FP thresholds here.
 * -------------------------------------------------------------------- */
const withMinimums = async (portfolio) => {
  const funds   = (portfolio.funds ?? []).filter((f) => f.weight > 0);
  const missing = funds.filter((f) => f.minLumpsumAmount == null && f.minSipAmount == null);
  const resolved = missing.length ? await attachSchemeMinimums(missing) : [];
  const byIsin   = Object.fromEntries(resolved.map((f) => [f.isin, f]));
  const enriched = funds.map((f) =>
    byIsin[f.isin]
      ? { ...f, minLumpsumAmount: byIsin[f.isin].minLumpsumAmount, minSipAmount: byIsin[f.isin].minSipAmount }
      : f
  );
  return { ...portfolio, funds: enriched, ...calcPortfolioMinimums(enriched) };
};

/* ====================================================================
 *  POST /api/mf/smart-portfolio/recommend
 *  Pure recommendation — no DB write.
 *  Body: { age, riskLevel: "moderate"|"high", variant?: "standard"|"small" }
 * ==================================================================== */
export const recommendPortfolio = async (req, res) => {
  try {
    const { age, riskLevel } = req.body;
    const variant = normalizeVariant(req.body.variant);
    if (!age) return res.status(400).json({ success: false, message: "age is required" });
    if (!["moderate", "high"].includes(riskLevel)) {
      return res.status(400).json({ success: false, message: "riskLevel must be 'moderate' or 'high'" });
    }

    const { cfg, meta } = await loadUsableConfig(variant);
    if (!cfg) {
      return res.status(503).json({ success: false, message: `${meta.displayName} is not available right now.` });
    }

    const { allocation, funds } = computeAllocation(Number(age), riskLevel, cfg);

    console.log(`${TAG} recommend [${variant}] — age:${age} risk:${riskLevel} → equity:${allocation.equity}% debt:${allocation.debt}% gold:${allocation.gold}%`);
    return res.json({
      success: true,
      data: { ...(await withMinimums({ riskLevel, allocation, funds, inputs: { age: Number(age) } })), ...meta },
    });
  } catch (err) {
    console.error(`${TAG} recommend:`, err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ====================================================================
 *  POST /api/mf/smart-portfolio/save
 *  Save (lock) the recommended portfolio to the user's account.
 *  Body: { age, riskLevel: "moderate"|"high", variant?: "standard"|"small" }
 *
 *  Re-calculates fresh from config so the locked snapshot is always
 *  consistent with what was shown to the user.
 *  One Smart Portfolio per user: saving another variant replaces it — unless the
 *  current one is already invested (switching would lose its tracking) → 409.
 * ==================================================================== */
export const savePortfolio = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { age, riskLevel } = req.body;
    const variant = normalizeVariant(req.body.variant);

    if (!age) return res.status(400).json({ success: false, message: "age is required" });
    if (!["moderate", "high"].includes(riskLevel)) {
      return res.status(400).json({ success: false, message: "riskLevel must be 'moderate' or 'high'" });
    }

    const { cfg, meta } = await loadUsableConfig(variant);
    if (!cfg) return res.status(503).json({ success: false, message: `${meta.displayName} is not available right now.` });

    const existing = await UserSmartPortfolio.findOne({ uniqueId }, { variant: 1, status: 1 }).lean();
    if (existing && existing.status === "invested" && variantOf(existing) !== variant) {
      const current = variantMeta(variantOf(existing), await SmartPortfolioConfig.findOne({ key: configKey(variantOf(existing)) }).lean());
      return res.status(409).json({
        success: false,
        code: "SMART_PORTFOLIO_ALREADY_INVESTED",
        message: `You've already invested in ${current.displayName}. You can keep adding to it.`,
        data: { currentVariant: current.variant, currentDisplayName: current.displayName },
      });
    }

    const { allocation, funds: rawFunds } = computeAllocation(Number(age), riskLevel, cfg);
    // Lock minimums into the snapshot so /my and invest use the same numbers
    const { funds, minLumpsumInvestment, minSipInvestment } = await withMinimums({ funds: rawFunds });

    const portfolio = await UserSmartPortfolio.findOneAndUpdate(
      { uniqueId },
      {
        uniqueId,
        variant,
        riskLevel,
        inputs:         { age: Number(age) },
        allocation,
        funds,
        minLumpsumInvestment,
        minSipInvestment,
        status:         "saved",
        investmentType: null,
        linkedOrderIds: [],
        linkedSipId:    null,
        assignedByAdmin: false,
        adminNote:       null,
      },
      { upsert: true, new: true }
    );

    console.log(`${TAG} save [${variant}] — ${uniqueId} age:${age} risk:${riskLevel}`);
    return res.json({ success: true, message: "Portfolio saved", data: { ...(await withMinimums(portfolio.toObject())), ...meta } });
  } catch (err) {
    console.error(`${TAG} save:`, err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ====================================================================
 *  GET /api/mf/smart-portfolio/my
 * ==================================================================== */
export const getMyPortfolio = async (req, res) => {
  try {
    const portfolio = await UserSmartPortfolio.findOne({ uniqueId: req.user.uniqueId }).lean();
    if (!portfolio) return res.status(404).json({ success: false, message: "No portfolio saved yet" });
    const variant = variantOf(portfolio);
    const cfg     = await SmartPortfolioConfig.findOne({ key: configKey(variant) }).lean();
    // Older saved snapshots may contain 0% funds — never expose them
    return res.json({ success: true, data: { ...(await withMinimums(portfolio)), ...variantMeta(variant, cfg) } });
  } catch (err) {
    console.error(`${TAG} getMyPortfolio:`, err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ====================================================================
 *  GET /api/mf/smart-portfolio/variants
 *  Which Smart Portfolio variants the app may offer, with display copy.
 * ==================================================================== */
export const listVariants = async (req, res) => {
  try {
    const cfgs = await SmartPortfolioConfig.find({ key: { $in: VARIANTS.map(configKey) } }).lean();
    const byKey = Object.fromEntries(cfgs.map((c) => [c.key, c]));
    const data = VARIANTS.map((v) => {
      const cfg = byKey[configKey(v)];
      const meta = variantMeta(v, cfg);
      return { ...meta, isEnabled: meta.isEnabled && isConfigured(cfg) };
    });
    return res.json({ success: true, data });
  } catch (err) {
    console.error(`${TAG} listVariants:`, err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ====================================================================
 *  POST /api/mf/smart-portfolio/invest
 *  Called by frontend AFTER placing orders via basket-purchase / basket-sip.
 *  Links the order ids to the portfolio for tracking.
 *  Body: { investmentType: "lumpsum"|"sip", linkedOrderIds?, linkedSipId? }
 * ==================================================================== */
export const markInvested = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { investmentType, linkedOrderIds, linkedSipId } = req.body;

    if (!["lumpsum", "sip"].includes(investmentType)) {
      return res.status(400).json({ success: false, message: "investmentType must be 'lumpsum' or 'sip'" });
    }

    const portfolio = await UserSmartPortfolio.findOne({ uniqueId });
    if (!portfolio) return res.status(404).json({ success: false, message: "No saved portfolio found" });

    portfolio.status         = "invested";
    portfolio.investmentType = investmentType;
    if (linkedOrderIds?.length) portfolio.linkedOrderIds = linkedOrderIds;
    if (linkedSipId)            portfolio.linkedSipId    = linkedSipId;
    await portfolio.save();

    console.log(`${TAG} markInvested — ${uniqueId} type:${investmentType}`);
    return res.json({ success: true, message: "Portfolio marked as invested", data: portfolio });
  } catch (err) {
    console.error(`${TAG} markInvested:`, err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
