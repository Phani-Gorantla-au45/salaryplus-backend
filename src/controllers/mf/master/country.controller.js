import MfCountry from "../../../models/mf/master/mfCountry.model.js";
import { fetchFpCountries } from "../../../utils/mf/master/country.utils.js";

const SYNC_TTL_HOURS = 168; // country list is very stable — re-sync weekly

/* ------------------------------------------------------------------ */
/*  Internal — upsert all countries from FP into DB                    */
/* ------------------------------------------------------------------ */
const syncCountriesFromFp = async () => {
  const countries = await fetchFpCountries();

  const ops = countries.map((c) => ({
    updateOne: {
      filter: { ansiCode: c.ansi_code?.toUpperCase() },
      update: { $set: { name: c.name, ansiCode: c.ansi_code?.toUpperCase() } },
      upsert: true,
    },
  }));

  if (ops.length > 0) {
    await MfCountry.bulkWrite(ops);
    console.log(`✅ [COUNTRY SYNC] Synced ${ops.length} countries from FP`);
  }
  return ops.length;
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/master/countries                                        */
/*  User-facing — returns countries sorted by name, auto-syncs if      */
/*  the DB is empty or data is older than SYNC_TTL_HOURS.              */
/* ------------------------------------------------------------------ */
export const listCountries = async (req, res) => {
  try {
    const count = await MfCountry.countDocuments();
    const oldest = await MfCountry.findOne().sort({ updatedAt: 1 });
    const isStale =
      !oldest ||
      Date.now() - new Date(oldest.updatedAt).getTime() > SYNC_TTL_HOURS * 3600 * 1000;

    if (count === 0 || isStale) {
      console.log("🔄 [COUNTRIES] DB empty or stale — syncing from FP...");
      await syncCountriesFromFp();
    }

    const countries = await MfCountry.find().sort({ name: 1 }).lean();

    return res.status(200).json({
      success: true,
      count: countries.length,
      data: countries.map((c) => ({ name: c.name, ansiCode: c.ansiCode })),
    });
  } catch (err) {
    console.error("❌ [COUNTRIES] List error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/master/countries/sync                                  */
/*  Force re-sync from FP (admin use).                                  */
/* ------------------------------------------------------------------ */
export const syncCountries = async (req, res) => {
  try {
    const count = await syncCountriesFromFp();
    return res.status(200).json({ success: true, message: `Synced ${count} countries from FP` });
  } catch (err) {
    console.error("❌ [COUNTRY SYNC] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
