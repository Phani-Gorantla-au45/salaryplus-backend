import SmartPortfolioConfig from "../../../models/mf/smartPortfolio/smartPortfolioProfile.model.js";
import UserSmartPortfolio   from "../../../models/mf/smartPortfolio/userSmartPortfolio.model.js";
import { computeAllocation } from "./smartPortfolioAdmin.controller.js";

const TAG = "[SMART-PORTFOLIO]";

/* ====================================================================
 *  POST /api/mf/smart-portfolio/recommend
 *  Pure recommendation — no DB write.
 *  Body: { age, riskLevel: "moderate"|"high" }
 * ==================================================================== */
export const recommendPortfolio = async (req, res) => {
  try {
    const { age, riskLevel } = req.body;
    if (!age) return res.status(400).json({ success: false, message: "age is required" });
    if (!["moderate", "high"].includes(riskLevel)) {
      return res.status(400).json({ success: false, message: "riskLevel must be 'moderate' or 'high'" });
    }

    const cfg = await SmartPortfolioConfig.findOne({ key: "default" }).lean();
    if (!cfg || (!cfg.equity?.length && !cfg.debt?.length && !cfg.gold?.length)) {
      return res.status(503).json({ success: false, message: "Smart Portfolio not configured yet. Contact admin." });
    }

    const { allocation, funds } = computeAllocation(Number(age), riskLevel, cfg);

    console.log(`${TAG} recommend — age:${age} risk:${riskLevel} → equity:${allocation.equity}% debt:${allocation.debt}% gold:${allocation.gold}%`);
    return res.json({
      success: true,
      data: { riskLevel, allocation, funds, inputs: { age: Number(age) } },
    });
  } catch (err) {
    console.error(`${TAG} recommend:`, err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ====================================================================
 *  POST /api/mf/smart-portfolio/save
 *  Save (lock) the recommended portfolio to the user's account.
 *  Body: { age, riskLevel: "moderate"|"high" }
 *
 *  Re-calculates fresh from config so the locked snapshot is always
 *  consistent with what was shown to the user.
 * ==================================================================== */
export const savePortfolio = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { age, riskLevel } = req.body;

    if (!age) return res.status(400).json({ success: false, message: "age is required" });
    if (!["moderate", "high"].includes(riskLevel)) {
      return res.status(400).json({ success: false, message: "riskLevel must be 'moderate' or 'high'" });
    }

    const cfg = await SmartPortfolioConfig.findOne({ key: "default" }).lean();
    if (!cfg) return res.status(503).json({ success: false, message: "Smart Portfolio not configured yet" });

    const { allocation, funds } = computeAllocation(Number(age), riskLevel, cfg);

    const portfolio = await UserSmartPortfolio.findOneAndUpdate(
      { uniqueId },
      {
        uniqueId,
        riskLevel,
        inputs:         { age: Number(age) },
        allocation,
        funds,
        status:         "saved",
        investmentType: null,
        linkedOrderIds: [],
        linkedSipId:    null,
        assignedByAdmin: false,
        adminNote:       null,
      },
      { upsert: true, new: true }
    );

    console.log(`${TAG} save — ${uniqueId} age:${age} risk:${riskLevel}`);
    return res.json({ success: true, message: "Portfolio saved", data: portfolio });
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
    return res.json({ success: true, data: portfolio });
  } catch (err) {
    console.error(`${TAG} getMyPortfolio:`, err.message);
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
