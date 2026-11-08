import MfSmartSavingV2 from "../../../models/mf/smartSaving/mfSmartSavingV2.model.js";
import MfUserData from "../../../models/mf/mfUserData.model.js";
import MfPurchase from "../../../models/mf/purchase/mfPurchase.model.js";
import MfRedemption from "../../../models/mf/redemption/mfRedemption.model.js";
import User from "../../../models/user/user.model.js";
import { fetchFpHoldings } from "../../../utils/mf/reports/holdings.utils.js";
import { createFpBatchPurchase } from "../../../utils/mf/purchase/batchPurchase.utils.js";
import {
  createFpRedemption,
  patchFpRedemption,
  fetchFpRedemptionSummary,
  parseFpRedemptionSummary,
} from "../../../utils/mf/redemption/redemption.utils.js";
import {
  generateOtp,
  otpExpiresAt,
  sendConsentOtp,
  verifyConsentOtp,
} from "../../../utils/mf/consent.utils.js";

/* ====================================================================
 *  SMART ALLOCATION ENGINE
 *
 *  Instant redemption rule (corrected):
 *    instant_limit = min(holdings × pct, limitRupees)
 *    e.g. ₹50k holdings → min(45k, 50k) = 45k instant
 *         ₹60k holdings → min(54k, 50k) = 50k instant  ← hits ceiling
 *
 *  Sweet-spot per fund (where instant hits its ₹50k ceiling):
 *    threshold = limitRupees / pct  →  50000 / 0.90 = ₹55,556
 *
 *  Strategy: fill each fund (by rank) up to its threshold first.
 *  That maximises the number of funds hitting the ₹50k instant ceiling.
 *  Any overflow sits in rank-1 fund (extra capital there doesn't help
 *  instant capacity beyond ₹55,556 but the fund is the highest priority).
 *
 *  Existing holdings reduce how much we need to invest per fund.
 *  Funds already above threshold get 0 new investment — they already
 *  contribute their maximum ₹50k instant.
 * ==================================================================== */

const smartAllocate = (newAmount, activeFunds, existingHoldings = {}) => {
  if (!activeFunds.length || newAmount <= 0) return [];

  const funds     = [...activeFunds].sort((a, b) => a.rank - b.rank);
  const existing  = (f) => existingHoldings[f.isin] ?? 0;
  // TEST MODE: set SMART_SAVING_TEST_THRESHOLD=500 in .env to cap each fund at ₹500
  const testThreshold = process.env.SMART_SAVING_TEST_THRESHOLD ? Number(process.env.SMART_SAVING_TEST_THRESHOLD) : null;
  const threshold = (f) => testThreshold ?? (f.instantLimitRupees ?? 50000) / ((f.instantLimitPercent ?? 90) / 100);
  const minInv    = (f) => f.minInvestmentAmount ?? 0;

  const totalExisting = funds.reduce((s, f) => s + existing(f), 0);
  const T_total       = totalExisting + newAmount;
  const minThreshold  = Math.min(...funds.map(threshold));
  const N_needed      = Math.ceil(T_total / minThreshold);
  const N             = Math.min(N_needed, funds.length);
  const topN          = funds.slice(0, N);

  const alloc   = Object.fromEntries(funds.map((f) => [f.isin, 0]));
  let remaining = newAmount;

  // Phase 1 — fill each top-N fund to its threshold (deficit first).
  // Skip any fund where the calculated invest amount is below its minInvestmentAmount
  // so the remaining falls through to the next eligible fund in rank order.
  for (const f of topN) {
    if (remaining <= 0) break;
    const deficit = Math.max(0, threshold(f) - existing(f));
    const invest  = Math.min(deficit, remaining);
    if (invest > 0 && minInv(f) > 0 && invest < minInv(f)) continue; // below min — skip
    alloc[f.isin] += invest;
    remaining     -= invest;
  }

  // Phase 2 — spill remainder to first fund (in rank order) that can accept it.
  // Prefer the next unused fund (index N), fall back through all funds.
  if (remaining > 0) {
    const candidates = N < funds.length ? [funds[N], ...topN] : [...topN];
    const spillTo    = candidates.find((f) => minInv(f) === 0 || remaining >= minInv(f));
    if (spillTo) {
      alloc[spillTo.isin] += remaining;
      remaining = 0;
    }
    // remaining > 0 here means no fund in the basket accepts this amount
  }

  return funds
    .map((f) => ({ fund: f, amount: Math.round(alloc[f.isin]) }))
    .filter((a) => a.amount > 0);
};

/* ====================================================================
 *  INSTANT REDEMPTION CAPACITY for a single fund position
 *
 *  Rule: instant = min(holdings × pct, limitRupees)
 *   • 90% applies first (you can never instantly redeem > 90% of a fund)
 *   • ₹50k is the daily ceiling (FP/AMFI hard cap per fund per day)
 *   Example: ₹50k holdings → min(45k, 50k) = 45k instant
 *            ₹60k holdings → min(54k, 50k) = 50k instant
 *
 *  Uses FP's summary value (authoritative) when available.
 * ==================================================================== */
const instantCap = (fund, holdingValue, fpMaxInstant = null) => {
  const pct  = (fund.instantLimitPercent ?? 90) / 100;
  const rule = Math.min(holdingValue * pct, fund.instantLimitRupees ?? 50000);
  // Only override with FP's value when it's a positive number.
  // 0 means FP hasn't computed it yet (new account, test env, ineligible period) —
  // fall back to our formula so instant redemption isn't incorrectly blocked.
  if (fpMaxInstant != null && fpMaxInstant > 0) return Math.min(holdingValue, fpMaxInstant);
  return Math.max(0, rule);
};

/* ====================================================================
 *  INSTANT REDEMPTION CAPACITY (per folio → summed per fund)
 *
 *  • PRIMARY: FP pre-redemption summary (POST /v2/mf_redemptions/summary)
 *    per folio. max_instant_redemption_amount is used AS-IS — FP already
 *    applies 90% / ₹50k / today's usage. min_instant_redemption_amount
 *    is the smallest instant order allowed for that folio.
 *  • FALLBACK only (FP call failed, or 0 in sandbox):
 *      min( folio holding × pct,  limitRupees − instantUsedToday − FP-covered )
 *      defaults: pct = 90%, limitRupees = ₹50,000
 *    instantUsedToday = consented instant redemptions in this fund
 *    since 00:00 IST today (not failed/cancelled).
 *  • Fund capacity = sum of its folios' capacities.
 * ==================================================================== */
const INSTANT_EXCLUDED_STATES = ["failed", "cancelled", "reversed", "expired"];

const istStartOfToday = () => {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - IST_OFFSET_MS);
};

// → { [ISIN]: rupees already redeemed instantly today }
const fetchInstantUsedToday = async (uniqueId, isins) => {
  const map = {};
  if (!uniqueId || !isins.length) return map;
  try {
    const rows = await MfRedemption.aggregate([
      {
        $match: {
          uniqueId,
          isin:           { $in: isins.map((i) => i.toUpperCase()) },
          redemptionMode: "instant",
          consentGiven:   true,
          fpState:        { $nin: INSTANT_EXCLUDED_STATES },
          createdAt:      { $gte: istStartOfToday() },
        },
      },
      { $group: { _id: "$isin", total: { $sum: { $ifNull: ["$amount", 0] } } } },
    ]);
    for (const r of rows) map[r._id] = r.total;
  } catch (e) {
    console.warn("[SS-V2] Instant-used-today lookup failed:", e.message);
  }
  return map;
};

// → { fundCap, folioCaps: { [folioNumber]: cap } }
// FP sandbox often returns 0 for max_instant (not computed). In production a 0 is
// authoritative (nothing available instantly today); in sandbox we ignore 0.
const FP_IS_SANDBOX = () => /s\.finprim\.com/i.test(process.env.FP_API_URL ?? "");

// → { fundCap, folioCaps: { [folioNumber]: cap }, folioMins: { [folioNumber]: min } }
// instantMap: `${isin}:${folio}` → { max, min } from FP pre-redemption summary
//
// FP's max_instant_redemption_amount is AUTHORITATIVE — FP already applies
// 90% / ₹50k / per-day usage. We use it as-is for every folio where FP returned it.
// Our own rule (min(holding × pct, ₹50k − used today)) is ONLY a fallback for folios
// where FP gave nothing usable (call failed, or 0 in sandbox).
const computeFundInstant = (fund, holding, instantMap = {}, usedToday = 0) => {
  const empty = { fundCap: 0, folioCaps: {}, folioMins: {} };
  if (!holding || holding.currentValue <= 0) return empty;

  const pct     = (fund.instantLimitPercent ?? 90) / 100;
  const folios  = holding.folios ?? [holding];
  const sandbox = FP_IS_SANDBOX();

  const folioCaps = {};
  const folioMins = {};
  const fallback  = [];
  let fpTotal     = 0;

  for (const fo of folios) {
    const fp = instantMap[`${fund.isin}:${fo.folioNumber}`] ?? {};
    folioMins[fo.folioNumber] = fp.min != null && fp.min > 0 ? fp.min : 0;
    const fpUsable = fp.max != null && (fp.max > 0 || !sandbox);
    if (fpUsable) {
      folioCaps[fo.folioNumber] = Math.max(0, Math.floor(fp.max));
      fpTotal += folioCaps[fo.folioNumber];
    } else {
      fallback.push(fo);
    }
  }

  // Fallback folios: share what's left of the fund's ₹50k/day after FP-reported folios
  if (fallback.length) {
    let left = Math.max(0, (fund.instantLimitRupees ?? 50000) - (usedToday ?? 0) - fpTotal);
    for (const fo of [...fallback].sort((x, y) => y.currentValue - x.currentValue)) {
      const take = Math.floor(Math.min(fo.currentValue * pct, left));
      folioCaps[fo.folioNumber] = take;
      left -= take;
    }
  }

  // A folio below FP's min instant amount can't place an instant order
  for (const k of Object.keys(folioCaps)) {
    if (folioCaps[k] < (folioMins[k] ?? 0)) folioCaps[k] = 0;
  }

  const fundCap = Object.values(folioCaps).reduce((s, v) => s + v, 0);
  return { fundCap, folioCaps, folioMins };
};

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                       */
/* ------------------------------------------------------------------ */

const resolveIp = (req) => {
  const raw = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "127.0.0.1";
  return raw.startsWith("::ffff:") ? raw.slice(7) : raw === "::1" ? "127.0.0.1" : raw;
};

const resolveUserContacts = async (uniqueId, mfData) => {
  let phone = mfData?.phone?.number;
  let email = mfData?.email?.email;
  const isd = mfData?.phone?.isd ?? "91";
  if (!phone || !email) {
    const user = await User.findOne({ uniqueId });
    if (!phone) phone = user?.phone;
    if (!email) email = user?.email;
  }
  return { phone, email, isd };
};

const extractRows = (raw) => {
  if (Array.isArray(raw))                  return raw;
  if (Array.isArray(raw?.data))            return raw.data;
  if (Array.isArray(raw?.data?.data))      return raw.data.data;
  if (Array.isArray(raw?.data?.holdings))  return raw.data.holdings;
  if (Array.isArray(raw?.holdings))        return raw.holdings;

  // FP nested shape: { id, folios: [{ folio_number, schemes: [{ isin, market_value, holdings }] }] }
  const folios = raw?.folios ?? raw?.data?.folios;
  if (Array.isArray(folios)) {
    return folios.flatMap((folio) =>
      (folio.schemes ?? []).map((s) => ({
        isin:              (s.isin ?? "").toUpperCase(),
        folio_number:      folio.folio_number,
        current_value:     s.market_value?.amount ?? 0,
        redeemable_amount: s.market_value?.redeemable_amount ?? 0,
        units:             s.holdings?.units ?? 0,
        redeemable_units:  s.holdings?.redeemable_units ?? 0,
      }))
    );
  }

  console.warn("[SS-V2] Unexpected holdings response shape:", JSON.stringify(raw)?.slice(0, 300));
  return [];
};

// holdingsMap: isin → { currentValue (sum), folioNumber (primary), folios: FolioEntry[] }
// Multiple folios per ISIN are fully preserved in the `folios` array.
const fetchHoldingsMap = async (fpAccountId, basketIsins) => {
  const map = {};
  if (!fpAccountId) return map;
  try {
    const raw  = await fetchFpHoldings(fpAccountId);
    const rows = extractRows(raw);
    const set  = new Set(basketIsins);
    for (const h of rows) {
      const isin = (h.isin ?? h.scheme ?? "").toUpperCase();
      if (!set.has(isin) || (h.current_value ?? 0) <= 0) continue;
      const entry = {
        currentValue:     h.current_value,
        folioNumber:      h.folio_number ?? h.folio ?? null,
        units:            h.units ?? 0,
        redeemableUnits:  h.redeemable_units ?? h.units ?? 0,
        redeemableAmount: h.redeemable_amount ?? h.current_value,
      };
      if (!map[isin]) {
        map[isin] = { ...entry, folios: [entry] };
      } else {
        // Accumulate totals across folios
        map[isin].currentValue     += entry.currentValue;
        map[isin].redeemableAmount += entry.redeemableAmount;
        map[isin].units            += entry.units;
        map[isin].redeemableUnits  += entry.redeemableUnits;
        map[isin].folios.push(entry);
      }
    }
  } catch (e) {
    console.warn("[SS-V2] Holdings fetch failed:", e.message);
  }
  return map;
};

// Fetch instant redemption capacity per (isin, folio) — keyed as "ISIN:folioNumber"
// fpStringId: the FP string account ID (e.g. "mfia_xxx") required by v2/mf_redemptions/summary
// mobile: user's phone number — required by FP for UTI instant redemption summary
const fetchInstantSummaries = async (fpStringId, funds, holdingsMap, mobile = null) => {
  const map = {}; // `${isin}:${folio}` → { max, min } (null values if FP call failed)
  await Promise.all(
    funds.flatMap((fund) => {
      const h = holdingsMap[fund.isin];
      if (!h || !fpStringId) return [];
      return (h.folios ?? [h]).map(async (folio) => {
        if (!folio.folioNumber) return;
        const key = `${fund.isin}:${folio.folioNumber}`;
        try {
          const params = {
            mf_investment_account: fpStringId,
            folio:  folio.folioNumber,
            scheme: fund.isin,
            gateway: "ondc",
          };
          if (mobile) params.mobile = mobile;
          const s = await fetchFpRedemptionSummary(params);
          map[key] = parseFpRedemptionSummary(s, fund.isin, folio.folioNumber);
        } catch (e) {
          console.warn(`[SS-V2] Summary fallback for ${fund.isin}:${folio.folioNumber} — ${e.message}`);
          map[key] = { max: null, min: null };
        }
      });
    })
  );
  return map;
};

/* ====================================================================
 *  ADMIN — GET /api/mf/smart-saving-v2/admin
 *  List all baskets.
 * ==================================================================== */
export const listV2Baskets = async (req, res) => {
  try {
    const baskets = await MfSmartSavingV2.find().sort({ createdAt: -1 }).lean();
    return res.status(200).json({ success: true, count: baskets.length, data: baskets });
  } catch (err) {
    console.error("❌ [SS-V2 ADMIN] List error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ====================================================================
 *  ADMIN — POST /api/mf/smart-saving-v2/admin
 *  Create a new active basket (deactivates the previous one).
 *
 *  Body: {
 *    name, description?,
 *    funds: [{
 *      isin, fundName, amcName?,
 *      rank,                          ← lower = higher priority
 *      instantLimitRupees?,           ← default 50000
 *      instantLimitPercent?,          ← default 90
 *      minInvestmentAmount?
 *    }]
 *  }
 * ==================================================================== */
export const createV2Basket = async (req, res) => {
  try {
    const { name, description, funds } = req.body;

    if (!name?.trim()) return res.status(400).json({ success: false, message: "name is required" });
    if (!Array.isArray(funds) || !funds.length) return res.status(400).json({ success: false, message: "funds array is required" });

    for (const f of funds) {
      if (!f.isin || !f.fundName || !f.rank) {
        return res.status(400).json({ success: false, message: "Each fund needs isin, fundName, and rank" });
      }
    }

    await MfSmartSavingV2.updateMany({ isActive: true }, { $set: { isActive: false } });

    const basket = await MfSmartSavingV2.create({
      name:         name.trim(),
      description:  description?.trim() ?? null,
      isActive:     true,
      configuredBy: req.admin?.email ?? req.admin?.id ?? null,
      funds: funds.map((f) => ({
        isin:                f.isin.trim().toUpperCase(),
        fundName:            f.fundName.trim(),
        amcName:             f.amcName?.trim()            ?? null,
        rank:                Number(f.rank),
        instantLimitRupees:  f.instantLimitRupees  != null ? Number(f.instantLimitRupees)  : 50000,
        instantLimitPercent: f.instantLimitPercent != null ? Number(f.instantLimitPercent) : 90,
        minInvestmentAmount: f.minInvestmentAmount != null ? Number(f.minInvestmentAmount) : null,
        minRedemptionAmount: f.minRedemptionAmount != null ? Number(f.minRedemptionAmount) : null,
        isActive:            f.isActive !== false,
      })),
    });

    return res.status(201).json({ success: true, message: "Smart savings basket created", data: basket });
  } catch (err) {
    console.error("❌ [SS-V2 ADMIN] Create error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ====================================================================
 *  ADMIN — PATCH /api/mf/smart-saving-v2/admin/:id
 *  Update basket-level meta.
 * ==================================================================== */
export const updateV2Basket = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = {};
    for (const key of ["name", "description", "isActive"]) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (updates.name) updates.name = updates.name.trim();

    const basket = await MfSmartSavingV2.findByIdAndUpdate(id, { $set: updates }, { new: true });
    if (!basket) return res.status(404).json({ success: false, message: "Basket not found" });

    return res.status(200).json({ success: true, data: basket });
  } catch (err) {
    console.error("❌ [SS-V2 ADMIN] Update basket error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ====================================================================
 *  ADMIN — POST /api/mf/smart-saving-v2/admin/:id/funds
 *  Add a new fund to an existing basket.
 * ==================================================================== */
export const addFundToBasket = async (req, res) => {
  try {
    const { id } = req.params;
    const { isin, fundName, amcName, rank,
            instantLimitRupees, instantLimitPercent, minInvestmentAmount, minRedemptionAmount } = req.body;

    if (!isin || !fundName || !rank) {
      return res.status(400).json({ success: false, message: "isin, fundName, and rank are required" });
    }

    const basket = await MfSmartSavingV2.findById(id);
    if (!basket) return res.status(404).json({ success: false, message: "Basket not found" });

    const upperIsin = isin.trim().toUpperCase();
    if (basket.funds.some((f) => f.isin === upperIsin)) {
      return res.status(409).json({ success: false, message: `Fund ${upperIsin} already in this basket` });
    }

    basket.funds.push({
      isin:                upperIsin,
      fundName:            fundName.trim(),
      amcName:             amcName?.trim()            ?? null,
      rank:                Number(rank),
      instantLimitRupees:  instantLimitRupees  != null ? Number(instantLimitRupees)  : 50000,
      instantLimitPercent: instantLimitPercent != null ? Number(instantLimitPercent) : 90,
      minInvestmentAmount: minInvestmentAmount != null ? Number(minInvestmentAmount) : null,
      minRedemptionAmount: minRedemptionAmount != null ? Number(minRedemptionAmount) : null,
      isActive:            true,
    });
    await basket.save();

    return res.status(201).json({ success: true, data: basket });
  } catch (err) {
    console.error("❌ [SS-V2 ADMIN] Add fund error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ====================================================================
 *  ADMIN — PATCH /api/mf/smart-saving-v2/admin/:id/funds/:isin
 *  Update a specific fund config within a basket.
 * ==================================================================== */
export const updateFundInBasket = async (req, res) => {
  try {
    const { id, isin } = req.params;
    const upperIsin = isin.trim().toUpperCase();

    const basket = await MfSmartSavingV2.findById(id);
    if (!basket) return res.status(404).json({ success: false, message: "Basket not found" });

    const fund = basket.funds.find((f) => f.isin === upperIsin);
    if (!fund) return res.status(404).json({ success: false, message: `Fund ${upperIsin} not in this basket` });

    const editable = ["fundName", "amcName", "rank", "instantLimitRupees",
                      "instantLimitPercent", "minInvestmentAmount", "minRedemptionAmount", "isActive"];
    for (const key of editable) {
      if (req.body[key] !== undefined) {
        fund[key] = ["fundName", "amcName"].includes(key) ? req.body[key]?.trim() : req.body[key];
      }
    }
    await basket.save();

    return res.status(200).json({ success: true, data: basket });
  } catch (err) {
    console.error("❌ [SS-V2 ADMIN] Update fund error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ====================================================================
 *  USER — GET /api/mf/smart-saving-v2/basket
 *  Active basket + user's current holdings + instant capacity per fund.
 * ==================================================================== */
export const getV2Basket = async (req, res) => {
  try {
    const { uniqueId } = req.user;

    const basket = await MfSmartSavingV2.findOne({ isActive: true }).lean();
    if (!basket) return res.status(404).json({ success: false, message: "No active smart savings basket configured" });

    const mfData     = await MfUserData.findOne({ uniqueId }, { "investmentAccount.fpInvestmentAccountId": 1, "investmentAccount.fpInvestmentAccountOldId": 1, "phone.number": 1 }).lean();
    const fpAccountId = mfData?.investmentAccount?.fpInvestmentAccountOldId ?? mfData?.investmentAccount?.fpInvestmentAccountId ?? null;
    const userMobile  = mfData?.phone?.number ?? null;

    // Only active funds are part of Smart Savings for display & totals.
    // Holdings in inactive funds remain visible/redeemable via the regular MF portfolio.
    const activeFunds = basket.funds.filter((f) => f.isActive).sort((a, b) => a.rank - b.rank);
    const activeIsins = activeFunds.map((f) => f.isin);
    const fpStringId  = mfData?.investmentAccount?.fpInvestmentAccountId ?? null;
    const holdingsMap  = await fetchHoldingsMap(fpAccountId, activeIsins);
    const [instantMap, usedTodayMap] = await Promise.all([
      fetchInstantSummaries(fpStringId, activeFunds, holdingsMap, userMobile),
      fetchInstantUsedToday(uniqueId, activeIsins),
    ]);

    const funds = activeFunds.map((f) => {
      const h   = holdingsMap[f.isin] ?? { currentValue: 0, folioNumber: null, units: null };
      const { fundCap: cap, folioCaps } = computeFundInstant(f, h, instantMap, usedTodayMap[f.isin] ?? 0);
      return {
        isin:                 f.isin,
        fundName:             f.fundName,
        amcName:              f.amcName,
        rank:                 f.rank,
        instantLimitRupees:   f.instantLimitRupees,
        instantLimitPercent:  f.instantLimitPercent,
        minInvestmentAmount:  f.minInvestmentAmount,
        isActive:             f.isActive,
        currentValue:         Math.floor(h.currentValue),
        folioNumber:          h.folioNumber,
        units:                h.units,
        instantRedeemCapacity: Math.floor(cap),
        normalRedeemCapacity:  Math.max(0, Math.floor(h.currentValue - cap)),
        instantUsedToday:      Math.floor(usedTodayMap[f.isin] ?? 0),
        folios: (h.folios ?? []).map((fo) => ({
          folioNumber:           fo.folioNumber,
          currentValue:          Math.floor(fo.currentValue),
          instantRedeemCapacity: folioCaps[fo.folioNumber] ?? 0,
        })),
      };
    });

    const totalCurrentValue    = funds.reduce((s, f) => s + f.currentValue, 0);
    const totalInstantCapacity = funds.reduce((s, f) => s + f.instantRedeemCapacity, 0);

    // Effective minimum investment = lowest minInvestmentAmount across active funds.
    // The engine skips funds whose min isn't met and tries the next — so the basket
    // accepts any amount >= the lowest individual fund minimum.
    const activeMins = activeFunds
      .map((f) => f.minInvestmentAmount)
      .filter((v) => v != null && v > 0);
    const basketMinInvestment = activeMins.length ? Math.min(...activeMins) : null;

    return res.status(200).json({
      success: true,
      data: {
        basketId:             basket._id,
        name:                 basket.name,
        description:          basket.description,
        totalActiveFunds:     activeFunds.length,
        totalCurrentValue:    Math.floor(totalCurrentValue),
        totalInstantCapacity: Math.floor(totalInstantCapacity),
        basketMinInvestment,   // use this for frontend min-amount validation, not per-fund min
        funds,
      },
    });
  } catch (err) {
    console.error("❌ [SS-V2] Get basket error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ====================================================================
 *  USER — GET /api/mf/smart-saving-v2/invest/preview?amount=X
 *  Shows how the engine will split the investment before committing.
 * ==================================================================== */
export const previewSmartInvest = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { amount } = req.query;
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: "amount query param is required" });
    }
    const newAmount = Number(amount);

    const basket = await MfSmartSavingV2.findOne({ isActive: true }).lean();
    if (!basket) return res.status(404).json({ success: false, message: "No active smart savings basket" });

    const mfData      = await MfUserData.findOne({ uniqueId }, { "investmentAccount.fpInvestmentAccountId": 1, "investmentAccount.fpInvestmentAccountOldId": 1 }).lean();
    const fpAccountId  = mfData?.investmentAccount?.fpInvestmentAccountOldId ?? mfData?.investmentAccount?.fpInvestmentAccountId ?? null;
    const activeFunds  = basket.funds.filter((f) => f.isActive);
    const holdingsMap  = await fetchHoldingsMap(fpAccountId, activeFunds.map((f) => f.isin));

    const existingValues = Object.fromEntries(
      Object.entries(holdingsMap).map(([isin, h]) => [isin, h.currentValue])
    );

    const allocation = smartAllocate(newAmount, activeFunds, existingValues);

    // After-investment instant capacity simulation
    const fundsUsed = allocation.length;
    let totalInstantAfter = 0;
    let totalAfter        = 0;
    const allocationDetails = allocation.map((a) => {
      const existing     = existingValues[a.fund.isin] ?? 0;
      const afterBalance = existing + a.amount;
      const cap          = instantCap(a.fund, afterBalance);
      totalInstantAfter += cap;
      totalAfter        += afterBalance;
      return {
        isin:            a.fund.isin,
        fundName:        a.fund.fundName,
        rank:            a.fund.rank,
        existingBalance: Math.floor(existing),
        investAmount:    a.amount,
        balanceAfter:    Math.floor(afterBalance),
        instantCapAfter: Math.floor(cap),
        fullyInstant:    afterBalance <= (a.fund.instantLimitRupees ?? 50000),
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        newAmount,
        fundsUsed,
        allocation: allocationDetails,
        summary: {
          totalAfterInvestment:      Math.floor(totalAfter),
          totalInstantCapAfter:      Math.floor(totalInstantAfter),
          instantCoveragePercent:    totalAfter > 0 ? Math.round((totalInstantAfter / totalAfter) * 100) : 0,
          isFullyInstantRedeemable:  Math.floor(totalInstantAfter) >= Math.floor(totalAfter),
        },
      },
    });
  } catch (err) {
    console.error("❌ [SS-V2] Invest preview error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ====================================================================
 *  USER — POST /api/mf/smart-saving-v2/invest
 *  Smart invest: engine calculates split → creates FP batch purchase.
 *  Returns a purchaseId compatible with POST /api/mf/purchase/:id/confirm.
 *
 *  Body: { total_amount, payment_method: "NETBANKING"|"UPI" }
 * ==================================================================== */
export const smartInvest = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { total_amount, payment_method } = req.body;

    if (!total_amount || isNaN(Number(total_amount)) || Number(total_amount) <= 0) {
      return res.status(400).json({ success: false, message: "total_amount is required" });
    }
    if (!["NETBANKING", "UPI"].includes(payment_method)) {
      return res.status(400).json({ success: false, message: "payment_method must be NETBANKING or UPI" });
    }

    const basket = await MfSmartSavingV2.findOne({ isActive: true }).lean();
    if (!basket) return res.status(404).json({ success: false, message: "No active smart savings basket" });

    const mfData      = await MfUserData.findOne({ uniqueId });
    const fpOmsId     = mfData?.investmentAccount?.fpInvestmentAccountOldId ?? mfData?.investmentAccount?.fpInvestmentAccountId;
    const fpStringId  = mfData?.investmentAccount?.fpInvestmentAccountId;
    if (!fpOmsId || !fpStringId) return res.status(400).json({ success: false, message: "MF investment account not found. Complete setup first." });

    const activeFunds = basket.funds.filter((f) => f.isActive);
    const holdingsMap  = await fetchHoldingsMap(fpOmsId, activeFunds.map((f) => f.isin));

    const existingValues = Object.fromEntries(
      Object.entries(holdingsMap).map(([isin, h]) => [isin, h.currentValue])
    );

    const allocation = smartAllocate(Number(total_amount), activeFunds, existingValues);
    if (!allocation.length) {
      return res.status(400).json({ success: false, message: "Engine could not distribute amount across basket funds" });
    }

    /* ---- Check engine could allocate the full amount ---- */
    const totalAllocated = allocation.reduce((s, a) => s + a.amount, 0);
    if (totalAllocated === 0) {
      return res.status(400).json({
        success: false,
        message: "Amount is below the minimum investment required for all funds in the basket.",
      });
    }
    if (totalAllocated < Number(total_amount)) {
      // Partial allocation — engine skipped funds whose minInvestmentAmount wasn't met
      console.warn(`[SS-V2 INVEST] Partial allocation: requested=${total_amount} allocated=${totalAllocated}`);
    }

    /* ---- Build FP batch payload ---- */
    const userIp   = resolveIp(req);
    const fpPayload = allocation.map((a) => ({
      amount:                Number(a.amount),
      mf_investment_account: fpStringId,
      scheme:                a.fund.isin,
      gateway:               "ondc",
      user_ip:               userIp,
      ...(holdingsMap[a.fund.isin]?.folioNumber && { folio_number: holdingsMap[a.fund.isin].folioNumber }),
    }));

    console.log(`\n💡 [SS-V2 INVEST] user=${uniqueId} total=${total_amount} funds=${fpPayload.length}`);
    const fpOrders = await createFpBatchPurchase(fpPayload);
    if (!fpOrders.length) throw new Error("FP returned no orders");

    /* ---- Send OTP ---- */
    const { phone, email } = await resolveUserContacts(uniqueId, mfData);
    if (!phone) return res.status(400).json({ success: false, message: "No phone number. Cannot send OTP." });

    const otp    = generateOtp();
    const expiry = otpExpiresAt();
    await sendConsentOtp(phone, otp, email);

    /* ---- Save as MfPurchase (same shape as basket purchase) ---- */
    const primaryOrder = fpOrders[0];
    const totalAmount  = allocation.reduce((s, a) => s + a.amount, 0);
    const basketOrders = fpOrders.map((o, i) => ({
      fpPurchaseId: o.id,
      fpOldId:      o.old_id ?? null,
      isin:         o.scheme ?? allocation[i]?.fund.isin ?? null,
      amount:       o.amount ?? allocation[i]?.amount,
      fpState:      o.state ?? "created",
    }));

    const record = await MfPurchase.findOneAndUpdate(
      { fpPurchaseId: primaryOrder.id },
      {
        $set: {
          uniqueId,
          fpPurchaseId:          primaryOrder.id,
          fpOldId:               primaryOrder.old_id ?? null,
          mfInvestmentAccountId: fpStringId,
          amount:                totalAmount,
          isBasketOrder:         true,
          basketFunds:           allocation.map((a) => ({
            isin:   a.fund.isin,
            amount: a.amount,
            ...(holdingsMap[a.fund.isin]?.folioNumber && { folioNumber: holdingsMap[a.fund.isin].folioNumber }),
          })),
          basketOrders,
          fpOldIds:      basketOrders.map((o) => o.fpOldId).filter(Boolean),
          paymentMethod: payment_method,
          fpState:       primaryOrder.state ?? "created",
          otpCode:       otp,
          otpExpiresAt:  expiry,
          otpVerified:   false,
          tags:          ["smart_saving_v2"],
        },
      },
      { upsert: true, new: true }
    );

    console.log(`✅ [SS-V2 INVEST] purchaseId=${record._id} orders=${fpOrders.length}`);

    return res.status(201).json({
      success: true,
      message: "Smart savings investment created. OTP sent for consent.",
      data: {
        purchaseId:    record._id,
        fpPurchaseId:  record.fpPurchaseId,
        totalAmount,
        paymentMethod: payment_method,
        allocation:    basketOrders.map((o, i) => ({
          isin:         o.isin,
          fundName:     allocation[i]?.fund.fundName ?? null,
          fpPurchaseId: o.fpPurchaseId,
          amount:       o.amount,
          fpState:      o.fpState,
        })),
        otpSentTo:    `${phone.slice(0, 3)}****${phone.slice(-3)}`,
        otpExpiresAt: expiry,
        confirmUrl:   `POST /api/mf/purchase/${record._id}/confirm`,
      },
    });
  } catch (err) {
    console.error("❌ [SS-V2 INVEST] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ====================================================================
 *  USER — GET /api/mf/smart-saving-v2/redeem/preview?amount=X
 *  Shows instant vs normal split across funds before placing orders.
 * ==================================================================== */
export const previewSmartRedeem = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { amount } = req.query;
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: "amount query param is required" });
    }
    const requested = Number(amount);

    const basket = await MfSmartSavingV2.findOne({ isActive: true }).lean();
    if (!basket) return res.status(404).json({ success: false, message: "No active smart savings basket" });

    const mfData      = await MfUserData.findOne({ uniqueId }, { "investmentAccount.fpInvestmentAccountId": 1, "investmentAccount.fpInvestmentAccountOldId": 1, "phone.number": 1 }).lean();
    const fpOmsId     = mfData?.investmentAccount?.fpInvestmentAccountOldId ?? mfData?.investmentAccount?.fpInvestmentAccountId ?? null;
    const fpStringId  = mfData?.investmentAccount?.fpInvestmentAccountId ?? null;
    const userMobile  = mfData?.phone?.number ?? null;
    const activeFunds  = basket.funds.filter((f) => f.isActive).sort((a, b) => a.rank - b.rank);
    const holdingsMap  = await fetchHoldingsMap(fpOmsId, activeFunds.map((f) => f.isin));
    const [instantMap, usedTodayMap] = await Promise.all([
      fetchInstantSummaries(fpStringId, activeFunds, holdingsMap, userMobile),
      fetchInstantUsedToday(uniqueId, activeFunds.map((f) => f.isin)),
    ]);

    const { plan, totalInstant, totalNormal, covered } = buildRedeemPlan(requested, activeFunds, holdingsMap, instantMap, usedTodayMap);

    return res.status(200).json({
      success: true,
      data: {
        requestedAmount:    requested,
        coveredAmount:      covered,
        shortfall:          Math.max(0, requested - covered),
        canFullyFulfill:    covered >= requested,
        totalInstant,
        totalNormal,
        instantPercent:     covered > 0 ? Math.round((totalInstant / covered) * 100) : 0,
        funds: plan,
      },
    });
  } catch (err) {
    console.error("❌ [SS-V2 REDEEM PREVIEW] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ====================================================================
 *  Shared redemption plan builder (used by both preview and execute)
 * ==================================================================== */
const buildRedeemPlan = (requested, activeFunds, holdingsMap, instantMap, usedTodayMap = {}) => {
  let remaining    = requested;
  let totalInstant = 0;
  let totalNormal  = 0;
  const plan = [];

  for (const fund of activeFunds) {
    if (remaining <= 0) break;
    const h = holdingsMap[fund.isin];
    if (!h || h.currentValue <= 0) continue;

    // Iterate each folio separately so multi-folio ISINs are fully redeemed
    const folios    = h.folios ?? [h];
    const minRedeem = fund.minRedemptionAmount ?? 0;
    // Fund-level instant cap (90% / ₹50k-per-day), pre-split across folios
    const { folioCaps, folioMins } = computeFundInstant(fund, h, instantMap ?? {}, usedTodayMap[fund.isin] ?? 0);

    for (const folio of folios) {
      if (remaining <= 0) break;
      if (folio.currentValue <= 0) continue;

      const cap          = folioCaps[folio.folioNumber] ?? 0;
      const normalAvail  = Math.max(0, folio.currentValue - cap);

      // Instant order must meet both the fund's min redemption and FP's min instant amount
      const minInstant = Math.max(minRedeem, folioMins[folio.folioNumber] ?? 0);
      let instantTake = Math.min(remaining, Math.floor(cap));
      if (instantTake > 0 && minInstant > 0 && instantTake < minInstant) {
        const bumped = Math.min(minInstant, Math.floor(cap));
        instantTake  = bumped >= minInstant ? bumped : 0;
      }
      remaining -= instantTake;

      let normalTake = Math.min(remaining, Math.floor(normalAvail));
      if (normalTake > 0 && minRedeem > 0 && normalTake < minRedeem) {
        const bumped = Math.min(minRedeem, Math.floor(normalAvail));
        normalTake   = bumped >= minRedeem ? bumped : 0;
      }
      remaining -= normalTake;

      if (instantTake > 0 || normalTake > 0) {
        plan.push({
          isin:          fund.isin,
          fundName:      fund.fundName,
          rank:          fund.rank,
          folioNumber:   folio.folioNumber,
          currentValue:  Math.floor(folio.currentValue),
          instantAmount: instantTake,
          normalAmount:  normalTake,
          totalAmount:   instantTake + normalTake,
        });
        totalInstant += instantTake;
        totalNormal  += normalTake;
      }
    }
  }

  return { plan, totalInstant, totalNormal, covered: totalInstant + totalNormal };
};

/* ====================================================================
 *  USER — POST /api/mf/smart-saving-v2/redeem
 *  Creates all redemption orders (instant + normal) with ONE shared OTP.
 *  Body: { amount }
 * ==================================================================== */
export const smartRedeem = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { amount } = req.body;
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: "amount is required" });
    }
    const requested = Number(amount);

    const basket = await MfSmartSavingV2.findOne({ isActive: true }).lean();
    if (!basket) return res.status(404).json({ success: false, message: "No active smart savings basket" });

    const mfData       = await MfUserData.findOne({ uniqueId });
    const fpOmsId      = mfData?.investmentAccount?.fpInvestmentAccountOldId ?? mfData?.investmentAccount?.fpInvestmentAccountId;
    const fpStringId   = mfData?.investmentAccount?.fpInvestmentAccountId;
    if (!fpOmsId || !fpStringId) return res.status(400).json({ success: false, message: "MF investment account not found." });

    const activeFunds = basket.funds.filter((f) => f.isActive).sort((a, b) => a.rank - b.rank);
    const holdingsMap  = await fetchHoldingsMap(fpOmsId, activeFunds.map((f) => f.isin));

    if (!Object.keys(holdingsMap).length) {
      return res.status(400).json({ success: false, message: "No holdings found in smart savings funds." });
    }

    const [instantMap, usedTodayMap] = await Promise.all([
      fetchInstantSummaries(fpStringId, activeFunds, holdingsMap, mfData?.phone?.number ?? null),
      fetchInstantUsedToday(uniqueId, activeFunds.map((f) => f.isin)),
    ]);
    const { plan, covered } = buildRedeemPlan(requested, activeFunds, holdingsMap, instantMap, usedTodayMap);

    if (!plan.length || covered === 0) {
      return res.status(400).json({ success: false, message: "Insufficient holdings to fulfill this withdrawal." });
    }

    /* ---- One shared OTP for all orders ---- */
    const { phone, email, isd } = await resolveUserContacts(uniqueId, mfData);
    if (!phone) return res.status(400).json({ success: false, message: "No phone number. Cannot send OTP." });

    const sharedOtp    = generateOtp();
    const sharedExpiry = otpExpiresAt();
    const userIp       = resolveIp(req);

    /* ---- Create FP redemption orders ---- */
    const createdIds    = [];
    const createdOrders = [];

    for (const entry of plan) {
      const fund = activeFunds.find((f) => f.isin === entry.isin);

      for (const [amount, mode] of [[entry.instantAmount, "instant"], [entry.normalAmount, "normal"]]) {
        if (amount <= 0) continue;

        // 30-minute duplicate restriction: same PAN+Folio+Scheme instant order within 30 min fails at FP

        const fpPayload = {
          mf_investment_account: fpStringId,
          folio_number:          entry.folioNumber,
          scheme:                entry.isin,
          amount,
          user_ip:               userIp,
          ...(mode === "instant" && { redemption_mode: "instant", gateway: "rta" }),
        };

        let fpData;
        try {
          fpData = await createFpRedemption(fpPayload);
        } catch (err) {
          console.error(`[SS-V2 REDEEM] FP order failed isin=${entry.isin} mode=${mode}:`, err.message);
          continue;
        }

        const record = await MfRedemption.findOneAndUpdate(
          { fpRedemptionId: fpData.id },
          {
            $set: {
              uniqueId,
              fpRedemptionId:        fpData.id,
              fpOldId:               fpData.old_id ?? null,
              mfInvestmentAccountId: fpStringId,
              folioNumber:           fpData.folio_number ?? entry.folioNumber,
              isin:                  fpData.scheme ?? entry.isin,
              amount,
              units:                 null,
              redemptionMode:        mode,
              gateway:               mode === "instant" ? "rta"     : null,
              fpState:               fpData.state ?? (mode === "instant" ? "pending" : "under_review"),
              otpCode:               sharedOtp,
              otpExpiresAt:          sharedExpiry,
              otpVerified:           false,
              consentGiven:          false,
              rawResponse:           fpData,
              tags:                  ["smart_saving_v2"],
            },
          },
          { upsert: true, new: true }
        );

        createdIds.push(record._id.toString());
        createdOrders.push({
          redemptionId:   record._id,
          fpRedemptionId: record.fpRedemptionId,
          isin:           record.isin,
          fundName:       fund?.fundName ?? null,
          amount:         record.amount,
          redemptionMode: record.redemptionMode,
          fpState:        record.fpState,
        });
      }
    }

    if (!createdIds.length) {
      return res.status(500).json({ success: false, message: "Failed to create any redemption orders. Please try again." });
    }

    await sendConsentOtp(phone, sharedOtp, email);

    const totalInstant = createdOrders.filter((o) => o.redemptionMode === "instant").reduce((s, o) => s + o.amount, 0);
    const totalNormal  = createdOrders.filter((o) => o.redemptionMode === "normal").reduce((s, o) => s + o.amount, 0);

    console.log(`✅ [SS-V2 REDEEM] user=${uniqueId} orders=${createdIds.length} instant=${totalInstant} normal=${totalNormal}`);

    return res.status(201).json({
      success: true,
      message: `${createdIds.length} redemption order(s) placed. OTP sent for consent.`,
      data: {
        requestedAmount: requested,
        coveredAmount:   covered,
        shortfall:       Math.max(0, requested - covered),
        totalInstant,
        totalNormal,
        orders:          createdOrders,
        redemptionIds:   createdIds,
        otpSentTo:       `${phone.slice(0, 3)}****${phone.slice(-3)}`,
        otpExpiresAt:    sharedExpiry,
        confirmUrl:      "POST /api/mf/smart-saving-v2/redeem/confirm",
      },
    });
  } catch (err) {
    console.error("❌ [SS-V2 REDEEM] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ====================================================================
 *  USER — POST /api/mf/smart-saving-v2/redeem/confirm
 *  One OTP confirms all smart savings redemption orders.
 *  Body: { redemptionIds: [...], otp }
 * ==================================================================== */
export const confirmSmartRedeem = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { redemptionIds, otp } = req.body;

    if (!Array.isArray(redemptionIds) || !redemptionIds.length) {
      return res.status(400).json({ success: false, message: "redemptionIds array is required" });
    }
    if (!otp) return res.status(400).json({ success: false, message: "otp is required" });

    const records = await MfRedemption.find({ _id: { $in: redemptionIds }, uniqueId }).select("+otpCode");
    if (!records.length) return res.status(404).json({ success: false, message: "No matching redemption orders found" });

    /* ---- Verify OTP (all records share the same OTP) ---- */
    const primary = records[0];
    const { valid, reason } = verifyConsentOtp(otp, primary.otpCode, primary.otpExpiresAt);
    if (!valid) return res.status(400).json({ success: false, message: reason });

    /* ---- Build consent ---- */
    const mfData = await MfUserData.findOne({ uniqueId });
    const { phone, email, isd } = await resolveUserContacts(uniqueId, mfData);
    if (!phone || !email) return res.status(400).json({ success: false, message: "Phone and email required for consent" });

    const baseConsent = { email, isd_code: isd, mobile: phone };
    const results     = [];

    for (const record of records) {
      if (record.consentGiven) {
        results.push({ redemptionId: record._id, status: "already_confirmed", fpState: record.fpState });
        continue;
      }
      try {
        // FP/RTA: instant redemption consent = mobile OTP only (email auth not supported)
        const consent = record.redemptionMode === "instant"
          ? { isd_code: isd, mobile: phone, otp }
          : { ...baseConsent };
        const fpData = await patchFpRedemption({ id: record.fpRedemptionId, state: "confirmed", consent });

        await MfRedemption.updateOne({ _id: record._id }, {
          $set: {
            fpState:      fpData.state ?? "confirmed",
            otpVerified:  true,
            consentGiven: true,
            consentAt:    new Date(),
            otpCode:      null,
            rawResponse:  fpData,
          },
        });
        results.push({
          redemptionId:   record._id,
          fpRedemptionId: record.fpRedemptionId,
          isin:           record.isin,
          amount:         record.amount,
          redemptionMode: record.redemptionMode,
          fpState:        fpData.state ?? "confirmed",
          status:         "confirmed",
        });
      } catch (err) {
        console.error(`[SS-V2 CONFIRM] Failed for ${record.fpRedemptionId}:`, err.message);
        results.push({ redemptionId: record._id, fpRedemptionId: record.fpRedemptionId, status: "failed", error: err.message });
      }
    }

    const confirmed = results.filter((r) => r.status === "confirmed").length;
    const failed    = results.filter((r) => r.status === "failed").length;

    return res.status(200).json({
      success: failed === 0,
      message: `${confirmed} confirmed${failed ? `, ${failed} failed` : ""}.`,
      confirmedCount: confirmed,
      failedCount:    failed,
      data:           results,
    });
  } catch (err) {
    console.error("❌ [SS-V2 CONFIRM REDEEM] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
