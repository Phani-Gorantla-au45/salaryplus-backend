import BrokerageRecord from "../../../../models/mf/brokerage/brokerageRecord.model.js";

/* ================================================================
 * GET /api/mf/admin/brokerage/months
 * Distinct months with data, each with a quick total — powers the
 * month-picker dropdown in the admin portal.
 * ================================================================ */
export const listAvailableMonths = async (req, res) => {
  try {
    const agg = await BrokerageRecord.aggregate([
      {
        $group: {
          _id: "$month",
          totalBrokerage: { $sum: "$brokerageAmount" },
          recordCount: { $sum: 1 },
        },
      },
      { $sort: { _id: -1 } },
    ]);

    return res.status(200).json({
      success: true,
      data: agg.map((m) => ({
        month: m._id,
        totalBrokerage: Math.round(m.totalBrokerage * 100) / 100,
        recordCount: m.recordCount,
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ================================================================
 * GET /api/mf/admin/brokerage/report?month=2026-05
 * Total commission + per-AMC breakdown for the selected month.
 * Optional &source=CAMS|KARVY to scope to one source only.
 * ================================================================ */
export const getMonthlyBrokerageReport = async (req, res) => {
  try {
    const { month, source } = req.query;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ success: false, message: "month is required, format YYYY-MM" });
    }

    const match = { month };
    if (source) match.source = source;

    const [totals, byAmc, bySource] = await Promise.all([
      BrokerageRecord.aggregate([
        { $match: match },
        { $group: { _id: null, totalBrokerage: { $sum: "$brokerageAmount" }, recordCount: { $sum: 1 } } },
      ]),
      BrokerageRecord.aggregate([
        { $match: match },
        {
          $group: {
            _id: { amcCode: "$amcCode", amcName: "$amcName", source: "$source" },
            totalBrokerage: { $sum: "$brokerageAmount" },
            recordCount: { $sum: 1 },
          },
        },
        { $sort: { totalBrokerage: -1 } },
      ]),
      BrokerageRecord.aggregate([
        { $match: match },
        { $group: { _id: "$source", totalBrokerage: { $sum: "$brokerageAmount" }, recordCount: { $sum: 1 } } },
      ]),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        month,
        totalBrokerage: Math.round((totals[0]?.totalBrokerage ?? 0) * 100) / 100,
        recordCount: totals[0]?.recordCount ?? 0,
        bySource: bySource.map((s) => ({
          source: s._id,
          totalBrokerage: Math.round(s.totalBrokerage * 100) / 100,
          recordCount: s.recordCount,
        })),
        byAmc: byAmc.map((a) => ({
          source: a._id.source,
          amcCode: a._id.amcCode,
          amcName: a._id.amcName ?? `Unmapped (${a._id.amcCode})`,
          totalBrokerage: Math.round(a.totalBrokerage * 100) / 100,
          recordCount: a.recordCount,
        })),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ================================================================
 * GET /api/mf/admin/brokerage/report/details?month=2026-05&amcCode=B
 * Drill-down — individual transaction-level records for one AMC in
 * one month (paginated).
 * ================================================================ */
export const getBrokerageRecordDetails = async (req, res) => {
  try {
    const { month, amcCode, source, page = 1, limit = 50 } = req.query;
    if (!month) {
      return res.status(400).json({ success: false, message: "month is required" });
    }

    const filter = { month };
    if (amcCode) filter.amcCode = amcCode;
    if (source) filter.source = source;

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(200, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [records, total] = await Promise.all([
      BrokerageRecord.find(filter).sort({ brokerageAmount: -1 }).skip(skip).limit(limitNum).lean(),
      BrokerageRecord.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
      data: records,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
