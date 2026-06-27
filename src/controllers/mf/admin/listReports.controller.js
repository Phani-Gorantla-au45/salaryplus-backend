import MfUserData from "../../../models/mf/mfUserData.model.js";
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
 *   folio_number, pan_number
 * ================================================================ */
export const getTransactionListReport = async (req, res) => {
  try {
    const { partner, traded_on_from, traded_on_to, primary_investor_name, folio_number, pan_number } = req.query;

    const payload = {};
    if (partner) payload.partner = partner;
    if (traded_on_from) payload.traded_on_from = traded_on_from;
    if (traded_on_to) payload.traded_on_to = traded_on_to;
    if (primary_investor_name) payload.primary_investor_name = primary_investor_name;
    if (folio_number) payload.folio_number = folio_number;
    if (pan_number) payload.pan_number = pan_number;

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

    return res.status(200).json({
      success: true,
      count: parsed.length,
      data: parsed.map((r) => ({ ...r, uniqueId: folioToUniqueId[r.folio_number] ?? null })),
      filters: fpResponse?.filter_by ?? payload,
    });
  } catch (err) {
    console.error("❌ [ADMIN TXN LIST REPORT] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ================================================================
 * GET /api/mf/admin/reports/purchases
 *
 * Query params (all optional, comma-separated):
 *   ids, states, plans, plan_old_ids
 * ================================================================ */
export const getPurchaseListReport = async (req, res) => {
  try {
    const { ids, states, plans, plan_old_ids } = req.query;

    const payload = {};
    if (ids) payload.ids = csvToArray(ids);
    if (states) payload.states = csvToArray(states);
    if (plans) payload.plans = csvToArray(plans);
    if (plan_old_ids) payload.plan_old_ids = csvToArray(plan_old_ids);

    const fpResponse = await fetchFpPurchaseListReport(payload);
    const parsed = parseRows(fpResponse);
    const enriched = await attachUsersByInvestmentAccount(parsed);

    return res.status(200).json({
      success: true,
      count: enriched.length,
      data: enriched,
      filters: fpResponse?.filter_by ?? payload,
    });
  } catch (err) {
    console.error("❌ [ADMIN PURCHASE LIST REPORT] Error:", err.message);
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
