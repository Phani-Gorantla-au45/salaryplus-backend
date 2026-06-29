import AmcCodeMap from "../../../../models/mf/brokerage/amcCodeMap.model.js";
import BrokerageRecord from "../../../../models/mf/brokerage/brokerageRecord.model.js";

/* ================================================================
 * GET /api/mf/admin/brokerage/amc-codes
 * Optional ?source=CAMS|KARVY, ?unmapped=true (only codes with no amcName)
 * ================================================================ */
export const listAmcCodeMaps = async (req, res) => {
  try {
    const { source, unmapped } = req.query;
    const filter = {};
    if (source) filter.source = source;
    if (unmapped === "true") filter.amcName = null;

    const maps = await AmcCodeMap.find(filter).sort({ source: 1, code: 1 }).lean();
    return res.status(200).json({ success: true, count: maps.length, data: maps });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ================================================================
 * PATCH /api/mf/admin/brokerage/amc-codes/:id
 * Body: { amcName }
 * Retroactively updates all already-ingested records using this code,
 * so older uploads don't stay "unmapped" after admin confirms a name.
 * ================================================================ */
export const updateAmcCodeMap = async (req, res) => {
  try {
    const { amcName } = req.body;
    if (!amcName || !amcName.trim()) {
      return res.status(400).json({ success: false, message: "amcName is required" });
    }

    const map = await AmcCodeMap.findByIdAndUpdate(
      req.params.id,
      { $set: { amcName: amcName.trim() } },
      { new: true },
    );
    if (!map) return res.status(404).json({ success: false, message: "Mapping not found" });

    await BrokerageRecord.updateMany(
      { source: map.source, amcCode: map.code },
      { $set: { amcName: map.amcName } },
    );

    return res.status(200).json({ success: true, message: "AMC name updated", data: map });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
