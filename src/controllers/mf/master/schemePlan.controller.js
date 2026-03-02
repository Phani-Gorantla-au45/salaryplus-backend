import MfSchemePlan from "../../../models/mf/master/mfSchemePlan.model.js";
import { fetchFpSchemePlan } from "../../../utils/mf/master/schemePlan.utils.js";

const ISIN_REGEX = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
const CACHE_TTL_HOURS = 12; // re-fetch from FP if scheme data is older than this

/* ------------------------------------------------------------------ */
/*  Internal helper — fetch from FP and upsert into DB                  */
/* ------------------------------------------------------------------ */
const syncSchemeFromFp = async (isin) => {
  const fpData = await fetchFpSchemePlan(isin);

  const record = await MfSchemePlan.findOneAndUpdate(
    { isin: isin.toUpperCase() },
    {
      $set: {
        isin:           fpData.isin?.toUpperCase(),
        fpSchemePlanId: fpData.id ?? null,
        gateway:        fpData.gateway,
        schemeName: fpData.mf_scheme?.name ?? null,
        fundName:   fpData.mf_fund?.name   ?? null,
        type:       fpData.type,
        option:     fpData.option,
        idcwOption: fpData.idcw_option     ?? null,
        active:     fpData.active          ?? true,
        thresholds: fpData.thresholds      ?? [],
        syncedAt:   new Date(),
      },
    },
    { upsert: true, new: true }
  );

  return record;
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/master/scheme-plans/:isin                               */
/*  Fetches scheme plan by ISIN. Serves from cache if fresh.            */
/* ------------------------------------------------------------------ */
export const getSchemePlan = async (req, res) => {
  try {
    const isin = req.params.isin?.toUpperCase().trim();

    if (!isin || !ISIN_REGEX.test(isin)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ISIN format (e.g. INF179KA1JD2)",
      });
    }

    /* ---------- CHECK CACHE ---------- */
    const cached = await MfSchemePlan.findOne({ isin });
    const isStale = !cached?.syncedAt
      || (Date.now() - new Date(cached.syncedAt).getTime()) > CACHE_TTL_HOURS * 3600 * 1000;

    let record = cached;
    if (!cached || isStale) {
      console.log(`🔄 [SCHEME] ${cached ? "Stale — re-fetching" : "Not in cache — fetching"} ISIN: ${isin}`);
      record = await syncSchemeFromFp(isin);
    }

    return res.status(200).json({
      success: true,
      data: {
        isin:        record.isin,
        schemeName:  record.schemeName,
        fundName:    record.fundName,
        type:        record.type,
        option:      record.option,
        idcwOption:  record.idcwOption,
        active:      record.active,
        thresholds:  record.thresholds,
        syncedAt:    record.syncedAt,
      },
    });
  } catch (err) {
    console.error("❌ [SCHEME] Fetch error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/master/scheme-plans                                     */
/*  List all cached scheme plans (with optional filters)                */
/* ------------------------------------------------------------------ */
export const listSchemePlans = async (req, res) => {
  try {
    const { active, type, option, search } = req.query;

    const filter = {};
    if (active === "true")   filter.active = true;
    if (active === "false")  filter.active = false;
    if (type)                filter.type   = type;
    if (option)              filter.option = option;
    if (search) {
      const regex = new RegExp(search, "i");
      filter.$or = [{ schemeName: regex }, { fundName: regex }, { isin: regex }];
    }

    const plans = await MfSchemePlan.find(filter)
      .sort({ schemeName: 1 })
      .select("-thresholds"); // exclude thresholds for list view (heavy)

    return res.status(200).json({
      success: true,
      count: plans.length,
      data: plans.map((p) => ({
        isin:       p.isin,
        schemeName: p.schemeName,
        fundName:   p.fundName,
        type:       p.type,
        option:     p.option,
        active:     p.active,
      })),
    });
  } catch (err) {
    console.error("❌ [SCHEME] List error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/master/scheme-plans/bulk-sync                          */
/*  Bulk fetch and cache multiple ISINs at once                         */
/* ------------------------------------------------------------------ */
export const bulkSyncSchemePlans = async (req, res) => {
  try {
    const { isins } = req.body;

    if (!Array.isArray(isins) || isins.length === 0) {
      return res.status(400).json({ success: false, message: "isins array is required" });
    }

    if (isins.length > 50) {
      return res.status(400).json({ success: false, message: "Maximum 50 ISINs per request" });
    }

    const results = { synced: [], failed: [] };

    // Process sequentially to avoid token rate limits
    for (const isin of isins) {
      const upper = isin?.toUpperCase().trim();
      if (!upper || !ISIN_REGEX.test(upper)) {
        results.failed.push({ isin: upper, reason: "Invalid ISIN format" });
        continue;
      }
      try {
        const record = await syncSchemeFromFp(upper);
        results.synced.push({ isin: record.isin, schemeName: record.schemeName });
      } catch (e) {
        results.failed.push({ isin: upper, reason: e.message });
      }
    }

    return res.status(200).json({
      success: true,
      synced: results.synced.length,
      failed: results.failed.length,
      results,
    });
  } catch (err) {
    console.error("❌ [SCHEME BULK SYNC] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
