import MfDailySipFund from "../../../models/mf/master/mfDailySipFund.model.js";

const VALID_TYPES = ["smart_savings", "short_term", "long_term"];

const publicShape = (doc) => ({
  id:            doc._id,
  type:          doc.type,
  isin:          doc.isin,
  fundName:      doc.fundName,
  fundHouseName: doc.fundHouseName,
  fundHouseLogo: doc.fundHouseLogo,
  minDailySip:   doc.minDailySip,
  description:   doc.description,
  isActive:      doc.isActive,
  updatedAt:     doc.updatedAt,
});

/* ------------------------------------------------------------------ */
/*  GET /api/mf/master/daily-sip-funds                                 */
/*  Frontend — returns all active funds, one per type.                 */
/* ------------------------------------------------------------------ */
export const listDailySipFunds = async (req, res) => {
  try {
    const funds = await MfDailySipFund.find({ isActive: true }).sort({ type: 1 });

    return res.status(200).json({
      success: true,
      count:   funds.length,
      data:    funds.map(publicShape),
    });
  } catch (err) {
    console.error("❌ [DAILY SIP FUND] List error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/admin/daily-sip-funds                                 */
/*  Admin — set fund for a given type. Deactivates previous config     */
/*  for that type before creating new one.                             */
/*                                                                     */
/*  Body: { type, isin, fundName, fundHouseName, fundHouseLogo?,       */
/*          minDailySip, description? }                                */
/* ------------------------------------------------------------------ */
export const upsertDailySipFund = async (req, res) => {
  try {
    const {
      type, isin, fundName, fundHouseName,
      fundHouseLogo, minDailySip, description,
    } = req.body;

    if (!type || !VALID_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `type must be one of: ${VALID_TYPES.join(", ")}`,
      });
    }
    if (!isin || !fundName || !fundHouseName || !minDailySip) {
      return res.status(400).json({
        success: false,
        message: "isin, fundName, fundHouseName, and minDailySip are required",
      });
    }

    // Deactivate previous active config for this type
    await MfDailySipFund.updateMany({ type, isActive: true }, { $set: { isActive: false } });

    const fund = await MfDailySipFund.create({
      type,
      isin:          isin.trim().toUpperCase(),
      fundName:      fundName.trim(),
      fundHouseName: fundHouseName.trim(),
      fundHouseLogo: fundHouseLogo?.trim() ?? null,
      minDailySip:   Number(minDailySip),
      description:   description?.trim() ?? null,
      isActive:      true,
      configuredBy:  req.admin?.email ?? req.admin?.id ?? null,
    });

    return res.status(201).json({
      success: true,
      message: `Daily SIP fund configured for type: ${type}`,
      data:    publicShape(fund),
    });
  } catch (err) {
    console.error("❌ [DAILY SIP FUND] Upsert error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  PATCH /api/mf/admin/daily-sip-funds/:id                           */
/*  Admin — update individual fields on an existing config.           */
/* ------------------------------------------------------------------ */
export const updateDailySipFund = async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = ["isin", "fundName", "fundHouseName", "fundHouseLogo",
                     "minDailySip", "description", "isActive"];

    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (updates.isin)          updates.isin          = updates.isin.trim().toUpperCase();
    if (updates.fundName)      updates.fundName      = updates.fundName.trim();
    if (updates.fundHouseName) updates.fundHouseName = updates.fundHouseName.trim();
    if (updates.minDailySip)   updates.minDailySip   = Number(updates.minDailySip);

    const fund = await MfDailySipFund.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true }
    );

    if (!fund) {
      return res.status(404).json({ success: false, message: "Config not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Daily SIP fund updated",
      data:    publicShape(fund),
    });
  } catch (err) {
    console.error("❌ [DAILY SIP FUND] Update error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/admin/daily-sip-funds                                  */
/*  Admin — list all configs including history.                        */
/* ------------------------------------------------------------------ */
export const listAllDailySipConfigs = async (req, res) => {
  try {
    const { type } = req.query;
    const filter = type ? { type } : {};
    const funds = await MfDailySipFund.find(filter).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count:   funds.length,
      data:    funds.map(publicShape),
    });
  } catch (err) {
    console.error("❌ [DAILY SIP FUND] Admin list error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
