import MfUserData from "../../../models/mf/mfUserData.model.js";
import MfSchemePlan from "../../../models/mf/master/mfSchemePlan.model.js";
import { fetchFpFolios } from "../../../utils/mf/folio.utils.js";
import {
  fetchFpTransactionListReport,
  fetchFpPurchaseListReport,
  fetchFpRedemptionListReport,
} from "../../../utils/mf/reports/listReports.utils.js";

/* ------------------------------------------------------------------ */
/*  Internal — parse FP's {columns, rows} tabular shape into objects.  */
/* ------------------------------------------------------------------ */
const parseRows = (fpResponse) => {
  const columns = fpResponse?.data?.columns ?? [];
  const rows = fpResponse?.data?.rows ?? [];
  return rows.map((row) => Object.fromEntries(columns.map((col, i) => [col, row[i]])));
};

const csvToArray = (value) => (value ? value.split(",").map((v) => v.trim()).filter(Boolean) : undefined);

/* ------------------------------------------------------------------ */
/*  Internal — replace ISIN codes in `scheme` field with human names.  */
/*  Adds schemeName + fundName from our MfSchemePlan collection.       */
/*  Single DB round-trip for all rows regardless of count.             */
/* ------------------------------------------------------------------ */
const enrichWithSchemeNames = async (rows) => {
  const isins = [...new Set(rows.map((r) => r.scheme).filter(Boolean))];
  if (isins.length === 0) return rows;

  const plans = await MfSchemePlan.find(
    { isin: { $in: isins } },
    { isin: 1, schemeName: 1, fundName: 1 }
  ).lean();

  const isinMap = Object.fromEntries(
    plans.map((p) => [p.isin, { schemeName: p.schemeName ?? null, fundName: p.fundName ?? null }])
  );

  return rows.map((r) => ({
    ...r,
    schemeName: isinMap[r.scheme]?.schemeName ?? null,
    fundName:   isinMap[r.scheme]?.fundName   ?? null,
  }));
};

/* ------------------------------------------------------------------ */
/*  Internal — attach our user info by resolving FP's                  */
/*  mf_investment_account back to a RegistrationUser (same pattern      */
/*  already used for admin SIP/folio/investment-account endpoints).    */
/* ------------------------------------------------------------------ */
const attachUsersByInvestmentAccount = async (parsed) => {
  const fpAccountIds = [...new Set(parsed.map((r) => r.mf_investment_account).filter(Boolean))];
  if (fpAccountIds.length === 0) return parsed.map((r) => ({ ...r, user: null }));

  const users = await MfUserData.find(
    { "investmentAccount.fpInvestmentAccountId": { $in: fpAccountIds } },
    { uniqueId: 1, "investmentAccount.fpInvestmentAccountId": 1, "investorProfile.name": 1, "investorProfile.pan": 1, "phone.number": 1, "email.email": 1 },
  ).lean();

  const userMap = {};
  for (const u of users) {
    userMap[u.investmentAccount?.fpInvestmentAccountId] = {
      uniqueId: u.uniqueId,
      name: u.investorProfile?.name ?? null,
      pan: u.investorProfile?.pan ?? null,
      phone: u.phone?.number ?? null,
      email: u.email?.email ?? null,
    };
  }

  return parsed.map((r) => ({ ...r, user: userMap[r.mf_investment_account] ?? null }));
};

/* ================================================================
 * GET /api/mf/admin/reports/transactions
 * RTA-level transaction ledger (purchases, redemptions, SIP
 * installments, corporate actions) — broader than the purchase/
 * redemption reports below.
 *
 * Query params (all optional):
 *   partner, traded_on_from, traded_on_to, primary_investor_name,
 *   folio_number, pan_number, uniqueId
 *
 * uniqueId: if provided, PAN is resolved from our DB and used as
 *           pan_number — overrides any pan_number query param.
 * ================================================================ */
export const getTransactionListReport = async (req, res) => {
  try {
    const { partner, traded_on_from, traded_on_to, primary_investor_name, folio_number, pan_number, uniqueId } = req.query;

    // Resolve PAN from DB when uniqueId is given
    let resolvedPan = pan_number ?? null;
    if (uniqueId) {
      const userData = await MfUserData.findOne(
        { uniqueId },
        { "investorProfile.pan": 1 }
      ).lean();
      resolvedPan = userData?.investorProfile?.pan ?? null;
      if (!resolvedPan) {
        return res.status(404).json({ success: false, message: `No PAN found in DB for uniqueId: ${uniqueId}` });
      }
      console.log(`🔍 [ADMIN TXN REPORT] Resolved PAN for ${uniqueId}: ${resolvedPan}`);
    }

    const payload = {};
    if (partner) payload.partner = partner;
    if (traded_on_from) payload.traded_on_from = traded_on_from;
    if (traded_on_to) payload.traded_on_to = traded_on_to;
    if (primary_investor_name) payload.primary_investor_name = primary_investor_name;
    if (folio_number) payload.folio_number = folio_number;
    if (resolvedPan) payload.pan_number = resolvedPan;

    const fpResponse = await fetchFpTransactionListReport(payload);
    const parsed = parseRows(fpResponse);

    // Resolve folio_number → uniqueId. This report's columns don't include
    // pan or mf_investment_account, only folio_number — so we look that up
    // via FP's own folio list (number → primary_investor_pan), then match
    // the PAN against our investor profiles.
    const folioNumbers = [...new Set(parsed.map((r) => r.folio_number).filter(Boolean))];
    let folioToUniqueId = {};
    if (folioNumbers.length > 0) {
      const fpFolios = await fetchFpFolios();
      const allFolios = fpFolios?.data ?? [];
      const folioToPan = {};
      for (const f of allFolios) {
        if (folioNumbers.includes(f.number) && f.primary_investor_pan) {
          folioToPan[f.number] = f.primary_investor_pan.toUpperCase().trim();
        }
      }
      const pans = [...new Set(Object.values(folioToPan))];
      if (pans.length > 0) {
        const users = await MfUserData.find(
          { "investorProfile.pan": { $in: pans } },
          { uniqueId: 1, "investorProfile.pan": 1 },
        ).lean();
        const panToUniqueId = Object.fromEntries(users.map((u) => [u.investorProfile.pan, u.uniqueId]));
        for (const [folio, pan] of Object.entries(folioToPan)) {
          if (panToUniqueId[pan]) folioToUniqueId[folio] = panToUniqueId[pan];
        }
      }
    }

    const withUniqueId = parsed.map((r) => ({ ...r, uniqueId: folioToUniqueId[r.folio_number] ?? null }));
    const enriched = await enrichWithSchemeNames(withUniqueId);

    return res.status(200).json({
      success: true,
      count: enriched.length,
      data:  enriched,
      filters: fpResponse?.filter_by ?? payload,
    });
  } catch (err) {
    console.error("❌ [ADMIN TXN LIST REPORT] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};


/* ------------------------------------------------------------------ */
/*  Internal — fetch ALL FP purchases and post-filter by              */
/*  mf_investment_account for the given uniqueId.                      */
/* ------------------------------------------------------------------ */
const fetchPurchasesForUser = async (uniqueId, extraPayload = {}) => {
  const userData = await MfUserData.findOne(
    { uniqueId },
    { "investmentAccount.fpInvestmentAccountId": 1 }
  ).lean();
  const fpAccountId = userData?.investmentAccount?.fpInvestmentAccountId ?? null;

  if (!fpAccountId) {
    return { rows: [], fpFilters: { uniqueId, mf_investment_account: null } };
  }

  console.log(`🔍 [PURCHASE REPORT] uniqueId=${uniqueId} fpAccount=${fpAccountId}`);

  const fpResponse = await fetchFpPurchaseListReport(extraPayload);
  const allRows = parseRows(fpResponse);
  const filtered = allRows.filter((r) => r.mf_investment_account === fpAccountId);
  const rows = await enrichWithSchemeNames(filtered);

  return { rows, fpFilters: { uniqueId, mf_investment_account: fpAccountId } };
};

/* ================================================================
 * GET /api/mf/admin/reports/purchases          (admin — all users)
 * GET /api/mf/admin/reports/purchases?uniqueId= (admin — one user)
 *
 * Query params (all optional, comma-separated):
 *   ids, states, plans, plan_old_ids, uniqueId
 * ================================================================ */
export const getPurchaseListReport = async (req, res) => {
  try {
    const { ids, states, plans, plan_old_ids, uniqueId } = req.query;

    const extraPayload = {};
    if (states)       extraPayload.states       = csvToArray(states);
    if (plans)        extraPayload.plans        = csvToArray(plans);
    if (plan_old_ids) extraPayload.plan_old_ids = csvToArray(plan_old_ids);

    if (uniqueId) {
      const { rows, fpFilters } = await fetchPurchasesForUser(uniqueId, extraPayload);
      const enriched = await attachUsersByInvestmentAccount(rows);

      // Hoist user info to top level — no need to repeat it on every row
      const userInfo = enriched[0]?.user ?? null;
      const data     = enriched.map(({ user, ...row }) => row);

      return res.status(200).json({
        success: true,
        user:    userInfo,
        count:   data.length,
        data,
        filters: fpFilters,
      });
    }

    if (ids) extraPayload.ids = csvToArray(ids);
    const fpResponse = await fetchFpPurchaseListReport(extraPayload);
    const parsed  = parseRows(fpResponse);
    const filters = fpResponse?.filter_by ?? extraPayload;

    const enriched = await attachUsersByInvestmentAccount(parsed);
    return res.status(200).json({ success: true, count: enriched.length, data: enriched, filters });
  } catch (err) {
    console.error("❌ [ADMIN PURCHASE LIST REPORT] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ================================================================
 * GET /api/mf/reports/purchases                (user — own data only)
 *
 * Authenticated user gets only their own FP purchases.
 * Optional query: ?states=successful,submitted
 * ================================================================ */
export const getUserPurchaseReport = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const extraPayload = {};
    if (req.query.states) extraPayload.states = csvToArray(req.query.states);

    const { rows, fpFilters } = await fetchPurchasesForUser(uniqueId, extraPayload);

    console.log(`📦 [USER PURCHASE REPORT] uniqueId=${uniqueId} count=${rows.length}`);
    if (rows.length > 0) console.log("📦 [USER PURCHASE REPORT] sample row:", JSON.stringify(rows[0], null, 2));

    return res.status(200).json({
      success: true,
      count:   rows.length,
      data:    rows,
      filters: fpFilters,
    });
  } catch (err) {
    console.error("❌ [USER PURCHASE REPORT] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ================================================================
 * GET /api/mf/admin/reports/redemptions
 *
 * Query params (all optional, comma-separated):
 *   ids, states, plans, plan_old_ids
 * ================================================================ */
export const getRedemptionListReport = async (req, res) => {
  try {
    const { ids, states, plans, plan_old_ids } = req.query;

    const payload = {};
    if (ids) payload.ids = csvToArray(ids);
    if (states) payload.states = csvToArray(states);
    if (plans) payload.plans = csvToArray(plans);
    if (plan_old_ids) payload.plan_old_ids = csvToArray(plan_old_ids);

    const fpResponse = await fetchFpRedemptionListReport(payload);
    const parsed = parseRows(fpResponse);
    const enriched = await attachUsersByInvestmentAccount(parsed);

    return res.status(200).json({
      success: true,
      count: enriched.length,
      data: enriched,
      filters: fpResponse?.filter_by ?? payload,
    });
  } catch (err) {
    console.error("❌ [ADMIN REDEMPTION LIST REPORT] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
