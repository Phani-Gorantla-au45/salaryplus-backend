import MfAmc from "../../../models/mf/master/mfAmc.model.js";
import { fetchAllFpAmcs } from "../../../utils/mf/master/amc.utils.js";

const SYNC_TTL_HOURS = 24; // re-sync from FP if data is older than this

/* ------------------------------------------------------------------ */
/*  Internal helper — upsert all AMCs from FP into DB                  */
/* ------------------------------------------------------------------ */
const syncAmcsFromFp = async () => {
  const amcs = await fetchAllFpAmcs();
  const ops = amcs.map((amc) => ({
    updateOne: {
      filter: { fpAmcId: amc.id },
      update: {
        $set: {
          fpAmcId: amc.id,
          name:    amc.name,
          active:  amc.active,
          amcCode: amc.amc_code ?? null,
        },
      },
      upsert: true,
    },
  }));

  if (ops.length > 0) {
    await MfAmc.bulkWrite(ops);
    console.log(`✅ [AMC SYNC] Synced ${ops.length} AMCs from FP`);
  }
  return ops.length;
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/master/amcs                                             */
/*  Returns all AMCs. Auto-syncs from FP if DB is empty or stale.      */
/* ------------------------------------------------------------------ */
export const listAmcs = async (req, res) => {
  try {
    const { active } = req.query; // ?active=true to filter active only

    /* ---------- CHECK IF DATA IS STALE ---------- */
    const count = await MfAmc.countDocuments();
    const oldest = await MfAmc.findOne().sort({ updatedAt: 1 });
    const isStale = !oldest || (Date.now() - new Date(oldest.updatedAt).getTime()) > SYNC_TTL_HOURS * 3600 * 1000;

    if (count === 0 || isStale) {
      console.log("🔄 [AMC] DB empty or stale — syncing from FP...");
      await syncAmcsFromFp();
    }

    /* ---------- QUERY DB ---------- */
    const filter = {};
    if (active === "true")  filter.active = true;
    if (active === "false") filter.active = false;

    const amcs = await MfAmc.find(filter).sort({ name: 1 });

    return res.status(200).json({
      success: true,
      count: amcs.length,
      data: amcs.map((a) => ({
        id:      a.fpAmcId,
        name:    a.name,
        active:  a.active,
        amcCode: a.amcCode,
      })),
    });
  } catch (err) {
    console.error("❌ [AMC] List error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/master/amcs/sync                                       */
/*  Force re-sync from FP (admin use / cron trigger)                    */
/* ------------------------------------------------------------------ */
export const syncAmcs = async (req, res) => {
  try {
    const count = await syncAmcsFromFp();
    return res.status(200).json({
      success: true,
      message: `Synced ${count} AMCs from FP`,
    });
  } catch (err) {
    console.error("❌ [AMC SYNC] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
