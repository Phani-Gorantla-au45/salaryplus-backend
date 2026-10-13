import MfUserData from "../../../models/mf/mfUserData.model.js";
import MfSchemePlan from "../../../models/mf/master/mfSchemePlan.model.js";
import { fetchFpFolios } from "../../../utils/mf/folio.utils.js";
import {
  fetchFpTransactionListReport,
  fetchFpPurchases,
  fetchFpPurchaseListReport,
  fetchFpRedemptions,
  fetchFpRedemptionListReport,
} from "../../../utils/mf/reports/listReports.utils.js";

/* ------------------------------------------------------------------ */
/*  Internal — parse FP's {columns, rows} tabular shape into objects.  */
/* ------------------------------------------------------------------ */
const parseRows = (fpResponse) => {
  const columns = fpResponse?.data?.columns ?? [];
  const rows = fpResponse?.data?.rows ?? [];
  return rows.map((row) =>
    Object.fromEntries(columns.map((col, i) => [col, row[i]])),
  );
};

const csvToArray = (value) =>
  value
    ? value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
    : undefined;

/* ------------------------------------------------------------------ */
/*  Internal — replace ISIN codes in `scheme` field with human names.  */
/*  Adds scheme_name + fund_name from our MfSchemePlan collection.     */
/*  Single DB round-trip for all rows regardless of count.             */
/* ------------------------------------------------------------------ */
const enrichWithSchemeNames = async (rows) => {
  const isins = [...new Set(rows.map((r) => r.scheme).filter(Boolean))];
  if (isins.length === 0) return rows;

  const plans = await MfSchemePlan.find(
    { isin: { $in: isins } },
    { isin: 1, schemeName: 1, fundName: 1 },
  ).lean();

  const isinMap = Object.fromEntries(
    plans.map((p) => [
      p.isin,
      { scheme_name: p.schemeName ?? null, fund_name: p.fundName ?? null },
    ]),
  );

  return rows.map((r) => ({
    ...r,
    scheme_name: isinMap[r.scheme]?.scheme_name ?? null,
    fund_name: isinMap[r.scheme]?.fund_name ?? null,
  }));
};

/* ------------------------------------------------------------------ */
/*  Internal — attach our user info by resolving FP's                  */
/*  mf_investment_account back to a RegistrationUser (same pattern      */
/*  already used for admin SIP/folio/investment-account endpoints).    */
/* ------------------------------------------------------------------ */
const attachUsersByInvestmentAccount = async (parsed) => {
  const fpAccountIds = [
    ...new Set(parsed.map((r) => r.mf_investment_account).filter(Boolean)),
  ];
  if (fpAccountIds.length === 0)
    return parsed.map((r) => ({ ...r, user: null }));

  const users = await MfUserData.find(
    { "investmentAccount.fpInvestmentAccountId": { $in: fpAccountIds } },
    {
      uniqueId: 1,
      "investmentAccount.fpInvestmentAccountId": 1,
      "investorProfile.name": 1,
      "investorProfile.pan": 1,
      "phone.number": 1,
      "email.email": 1,
    },
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

  return parsed.map((r) => ({
    ...r,
    user: userMap[r.mf_investment_account] ?? null,
  }));
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
    const {
      partner,
      traded_on_from,
      traded_on_to,
      primary_investor_name,
      folio_number,
      pan_number,
      uniqueId,
    } = req.query;

    // Resolve PAN from DB when uniqueId is given
    let resolvedPan = pan_number ?? null;
    if (uniqueId) {
      const userData = await MfUserData.findOne(
        { uniqueId },
        { "investorProfile.pan": 1 },
      ).lean();
      resolvedPan = userData?.investorProfile?.pan ?? null;
      if (!resolvedPan) {
        return res.status(404).json({
          success: false,
          message: `No PAN found in DB for uniqueId: ${uniqueId}`,
        });
      }
      console.log(
        `🔍 [ADMIN TXN REPORT] Resolved PAN for ${uniqueId}: ${resolvedPan}`,
      );
    }

    const payload = {};
    if (partner) payload.partner = partner;
    if (traded_on_from) payload.traded_on_from = traded_on_from;
    if (traded_on_to) payload.traded_on_to = traded_on_to;
    if (primary_investor_name)
      payload.primary_investor_name = primary_investor_name;
    if (folio_number) payload.folio_number = folio_number;
    if (resolvedPan) payload.pan_number = resolvedPan;

    const fpResponse = await fetchFpTransactionListReport(payload);
    const parsed = parseRows(fpResponse);

    // Resolve folio_number → uniqueId. This report's columns don't include
    // pan or mf_investment_account, only folio_number — so we look that up
    // via FP's own folio list (number → primary_investor_pan), then match
    // the PAN against our investor profiles.
    const folioNumbers = [
      ...new Set(parsed.map((r) => r.folio_number).filter(Boolean)),
    ];
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
        const panToUniqueId = Object.fromEntries(
          users.map((u) => [u.investorProfile.pan, u.uniqueId]),
        );
        for (const [folio, pan] of Object.entries(folioToPan)) {
          if (panToUniqueId[pan]) folioToUniqueId[folio] = panToUniqueId[pan];
        }
      }
    }

    const withUniqueId = parsed.map((r) => ({
      ...r,
      uniqueId: folioToUniqueId[r.folio_number] ?? null,
    }));
    const enriched = await enrichWithSchemeNames(withUniqueId);
    return res.status(200).json({
      success: true,
      count: enriched.length,
      data: enriched,
      filters: fpResponse?.filter_by ?? payload,
    });
  } catch (err) {
    console.error("❌ [ADMIN TXN LIST REPORT] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
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
    if (states) extraPayload.states = csvToArray(states);
    if (plans) extraPayload.plans = csvToArray(plans);
    if (plan_old_ids) extraPayload.plan_old_ids = csvToArray(plan_old_ids);

    if (uniqueId) {
      const userData = await MfUserData.findOne(
        { uniqueId },
        { "investmentAccount.fpInvestmentAccountId": 1, "investorProfile.name": 1, "investorProfile.pan": 1 }
      ).lean();
      const fpAccountId = userData?.investmentAccount?.fpInvestmentAccountId ?? null;

      if (!fpAccountId) {
        return res.status(404).json({ success: false, message: `No investment account found for uniqueId: ${uniqueId}` });
      }

      const params = { mf_investment_account: fpAccountId };
      if (states) params.states = states;

      const fpResponse = await fetchFpPurchases(params);
      const rows = await enrichWithSchemeNames(fpResponse?.data ?? []);

      return res.status(200).json({
        success: true,
        user: {
          uniqueId,
          name: userData?.investorProfile?.name ?? null,
          pan:  userData?.investorProfile?.pan  ?? null,
          mf_investment_account: fpAccountId,
        },
        count: rows.length,
        data:  rows,
      });
    }

    if (ids) extraPayload.ids = csvToArray(ids);
    const fpResponse = await fetchFpPurchaseListReport(extraPayload);
    const parsed = parseRows(fpResponse);
    const filters = fpResponse?.filter_by ?? extraPayload;

    const enriched = await attachUsersByInvestmentAccount(parsed);
    return res
      .status(200)
      .json({ success: true, count: enriched.length, data: enriched, filters });
  } catch (err) {
    console.error("❌ [ADMIN PURCHASE LIST REPORT] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ================================================================
 * GET /api/mf/reports/purchases                (user — own data only)
 *
 * Calls GET /v2/mf_purchases?mf_investment_account=<fpAccountId>
 * directly — no post-filtering needed.
 * Optional query: ?states=successful,submitted&since=2024-10-01
 * ================================================================ */
export const getUserPurchaseReport = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { states, since } = req.query;

    // Resolve the user's FP investment account from our DB
    const userData = await MfUserData.findOne(
      { uniqueId },
      { "investmentAccount.fpInvestmentAccountId": 1 }
    ).lean();
    const fpAccountId = userData?.investmentAccount?.fpInvestmentAccountId ?? null;

    if (!fpAccountId) {
      return res.status(404).json({ success: false, message: "No investment account found for this user" });
    }

    const params = { mf_investment_account: fpAccountId };
    if (states) params.states = states; // FP accepts comma-separated string

    const fpResponse = await fetchFpPurchases(params);
    let purchases = fpResponse?.data ?? [];

    // ?since=YYYY-MM-DD — filter by traded_on or created_at
    if (since) {
      purchases = purchases.filter(
        (p) => (p.traded_on ?? p.created_at?.slice(0, 10)) >= since
      );
    }

    const enriched = await enrichWithSchemeNames(purchases);

    console.log(`[USER PURCHASE REPORT] uniqueId=${uniqueId} fpAccount=${fpAccountId} total=${enriched.length}${since ? ` since=${since}` : ""}`);

    return res.status(200).json({
      success: true,
      count:   enriched.length,
      data:    enriched,
    });
  } catch (err) {
    console.error("❌ [USER PURCHASE REPORT] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ================================================================
 * GET /api/mf/reports/redemptions             (user — own data only)
 *
 * Calls GET /v2/mf_redemptions?mf_investment_account=<fpAccountId>
 * Optional query: ?states=successful,submitted&since=2024-10-01
 * ================================================================ */
export const getUserRedemptionReport = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { states, since } = req.query;

    const userData = await MfUserData.findOne(
      { uniqueId },
      { "investmentAccount.fpInvestmentAccountId": 1 }
    ).lean();
    const fpAccountId = userData?.investmentAccount?.fpInvestmentAccountId ?? null;

    if (!fpAccountId) {
      return res.status(404).json({ success: false, message: "No investment account found for this user" });
    }

    const params = { mf_investment_account: fpAccountId };
    if (states) params.states = states;

    const fpResponse = await fetchFpRedemptions(params);
    let redemptions = fpResponse?.data ?? [];

    if (since) {
      redemptions = redemptions.filter(
        (r) => (r.traded_on ?? r.created_at?.slice(0, 10)) >= since
      );
    }

    const enriched = await enrichWithSchemeNames(redemptions);

    console.log(`[USER REDEMPTION REPORT] uniqueId=${uniqueId} fpAccount=${fpAccountId} total=${enriched.length}${since ? ` since=${since}` : ""}`);

    return res.status(200).json({
      success: true,
      count:   enriched.length,
      data:    enriched,
    });
  } catch (err) {
    console.error("❌ [USER REDEMPTION REPORT] Error:", err.message);
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
