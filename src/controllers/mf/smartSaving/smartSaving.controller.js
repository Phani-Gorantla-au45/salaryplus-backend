import MfSmartSaving from "../../../models/mf/smartSaving/mfSmartSaving.model.js";

/* ------------------------------------------------------------------ */
/*  Internal — public response shape                                    */
/* ------------------------------------------------------------------ */
const publicShape = (doc) => ({
  id:                         doc._id,
  isin:                       doc.isin,
  fundName:                   doc.fundName,
  amcName:                    doc.amcName,
  description:                doc.description,
  minInvestmentAmount:        doc.minInvestmentAmount,
  maxInstantRedemptionAmount: doc.maxInstantRedemptionAmount,
  isActive:                   doc.isActive,
  updatedAt:                  doc.updatedAt,
});

/* ------------------------------------------------------------------ */
/*  GET /api/mf/smart-saving                                            */
/*  Frontend endpoint — returns the currently active fund config.      */
/* ------------------------------------------------------------------ */
export const getSmartSaving = async (req, res) => {
  try {
    const config = await MfSmartSaving.findOne({ isActive: true }).sort({ updatedAt: -1 });

    if (!config) {
      return res.status(404).json({
        success: false,
        message: "No active smart saving fund configured",
      });
    }

    return res.status(200).json({
      success: true,
      data: publicShape(config),
    });
  } catch (err) {
    console.error("❌ [SMART SAVING] Get error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/admin/smart-saving                                     */
/*  Admin — create or replace the active fund config.                  */
/*  Body: { isin, fundName, amcName, description?,                     */
/*          minInvestmentAmount?, maxInstantRedemptionAmount? }         */
/*                                                                      */
/*  Always deactivates any previous config before creating new one.    */
/* ------------------------------------------------------------------ */
export const upsertSmartSaving = async (req, res) => {
  try {
    const {
      isin, fundName, amcName, description,
      minInvestmentAmount, maxInstantRedemptionAmount,
    } = req.body;

    if (!isin || !fundName || !amcName) {
      return res.status(400).json({
        success: false,
        message: "isin, fundName, and amcName are required",
      });
    }

    // Deactivate all existing active configs
    await MfSmartSaving.updateMany({ isActive: true }, { $set: { isActive: false } });

    const config = await MfSmartSaving.create({
      isin:                       isin.trim().toUpperCase(),
      fundName:                   fundName.trim(),
      amcName:                    amcName.trim(),
      description:                description?.trim() ?? null,
      minInvestmentAmount:        minInvestmentAmount    ? Number(minInvestmentAmount)    : null,
      maxInstantRedemptionAmount: maxInstantRedemptionAmount ? Number(maxInstantRedemptionAmount) : null,
      isActive:                   true,
      configuredBy:               req.admin?.email ?? req.admin?.id ?? null,
    });

    return res.status(201).json({
      success: true,
      message: "Smart saving fund configured successfully",
      data: publicShape(config),
    });
  } catch (err) {
    console.error("❌ [SMART SAVING] Upsert error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  PATCH /api/mf/admin/smart-saving/:id                               */
/*  Admin — update individual fields on an existing config.            */
/* ------------------------------------------------------------------ */
export const updateSmartSaving = async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = ["isin", "fundName", "amcName", "description", "isActive",
                     "minInvestmentAmount", "maxInstantRedemptionAmount"];

    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (updates.isin)     updates.isin     = updates.isin.trim().toUpperCase();
    if (updates.fundName) updates.fundName = updates.fundName.trim();
    if (updates.amcName)  updates.amcName  = updates.amcName.trim();

    const config = await MfSmartSaving.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true }
    );

    if (!config) {
      return res.status(404).json({ success: false, message: "Config not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Smart saving fund updated",
      data: publicShape(config),
    });
  } catch (err) {
    console.error("❌ [SMART SAVING] Update error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/admin/smart-saving                                      */
/*  Admin — list all configs (history of changes).                     */
/* ------------------------------------------------------------------ */
export const listSmartSavingConfigs = async (req, res) => {
  try {
    const configs = await MfSmartSaving.find().sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      count: configs.length,
      data: configs.map(publicShape),
    });
  } catch (err) {
    console.error("❌ [SMART SAVING] List error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
