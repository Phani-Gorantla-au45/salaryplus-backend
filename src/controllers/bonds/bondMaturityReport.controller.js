import BondTrade from "../../models/bonds/bondTrade.model.js";
import RegistrationUser from "../../models/user/user.model.js";

/* ------------------------------------------------------------------ */
/*  Internal — parse maturity date strings                              */
/*  Supports: DD-MMM-YYYY ("15-Aug-2026"), YYYY-MM-DD, DD/MM/YYYY      */
/* ------------------------------------------------------------------ */
const MONTH_MAP = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

const parseMaturityDate = (value) => {
  if (!value || typeof value !== "string") return null;

  // DD-MMM-YYYY  e.g. "15-Aug-2026"
  const dmmmy = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/;
  let m = value.match(dmmmy);
  if (m) {
    const mon = m[2].charAt(0).toUpperCase() + m[2].slice(1).toLowerCase();
    if (mon in MONTH_MAP) return new Date(+m[3], MONTH_MAP[mon], +m[1], 0, 0, 0, 0);
  }

  // YYYY-MM-DD
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/;
  m = value.match(iso);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], 0, 0, 0, 0);

  // DD/MM/YYYY
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  m = value.match(dmy);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], 0, 0, 0, 0);

  return null;
};

const daysFromToday = (date) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((date - today) / (1000 * 60 * 60 * 24));
};

const maturityStatus = (days) => {
  if (days < 0)   return "matured";
  if (days <= 30)  return "maturing_30d";
  if (days <= 60)  return "maturing_60d";
  if (days <= 90)  return "maturing_90d";
  return "active";
};

/* ------------------------------------------------------------------ */
/*  GET /api/bw/admin/bonds/maturity-report                             */
/*  Batch job — run on demand by admin.                                 */
/*  Returns all user bond holdings sorted by maturity date (soonest     */
/*  first) so admin knows who to contact first for reinvestment pitch.  */
/*                                                                      */
/*  Query params (all optional):                                        */
/*    within_days — integer; only include bonds maturing within N days  */
/*    status      — matured | maturing_30d | maturing_60d |             */
/*                  maturing_90d | active                               */
/* ------------------------------------------------------------------ */
export const getBondMaturityReport = async (req, res) => {
  try {
    const { within_days, status } = req.query;

    /* ---------- FETCH ALL TRADES ---------- */
    const trades = await BondTrade.find({}).lean();

    if (!trades.length) {
      return res.status(200).json({
        success: true,
        generatedAt: new Date().toISOString(),
        summary: { total: 0, matured: 0, maturing_30d: 0, maturing_60d: 0, maturing_90d: 0, active: 0 },
        data: [],
      });
    }

    /* ---------- GROUP BY clientPan + isin ---------- */
    const holdingMap = {};
    for (const t of trades) {
      const key = `${t.clientPan}__${t.isin}`;
      if (!holdingMap[key]) {
        holdingMap[key] = {
          isin:         t.isin,
          issuerName:   t.issuerName,
          creditRating: t.creditRating,
          maturityDate: t.maturityDate,
          coupon:       t.coupon,
          clientYield:  t.clientYield,
          clientPan:    t.clientPan,
          clientName:   t.clientName,
          totalUnits:       0,
          totalInvestment:  0,
          trades:           [],
        };
      }
      holdingMap[key].totalUnits      += Number(t.units)         || 0;
      holdingMap[key].totalInvestment += Number(t.totalPurchase) || 0;
      holdingMap[key].trades.push({
        tradeId:       t.tradeId,
        tradeDate:     t.tradeDate,
        units:         t.units,
        faceValue:     t.faceValue,
        totalPurchase: t.totalPurchase,
        clientYield:   t.clientYield,
      });
    }

    /* ---------- RESOLVE USER CONTACT INFO ---------- */
    const allPans = [...new Set(Object.values(holdingMap).map((h) => h.clientPan).filter(Boolean))];
    const users   = await RegistrationUser.find(
      { panNumber: { $in: allPans } },
      { panNumber: 1, uniqueId: 1, phone: 1, email: 1, First_name: 1, Last_name: 1 },
    ).lean();

    const userByPan = {};
    for (const u of users) {
      userByPan[u.panNumber] = {
        uniqueId: u.uniqueId ?? null,
        phone:    u.phone    ?? null,
        email:    u.email    ?? null,
        name:     [u.First_name, u.Last_name].filter(Boolean).join(" ") || null,
      };
    }

    /* ---------- BUILD ENRICHED HOLDINGS + APPLY MATURITY LOGIC ---------- */
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let holdings = Object.values(holdingMap).map((h) => {
      const matDate = parseMaturityDate(h.maturityDate);
      const days    = matDate ? daysFromToday(matDate) : null;
      const stat    = days !== null ? maturityStatus(days) : "unknown";
      const user    = userByPan[h.clientPan] ?? null;

      return {
        maturityDate:        h.maturityDate ?? null,
        maturityDateParsed:  matDate ? matDate.toISOString().split("T")[0] : null,
        daysToMaturity:      days,
        status:              stat,
        isin:                h.isin,
        issuerName:          h.issuerName,
        creditRating:        h.creditRating,
        coupon:              h.coupon,
        clientYield:         h.clientYield,
        totalUnits:          h.totalUnits,
        totalInvestment:     h.totalInvestment,
        user: {
          clientName: h.clientName ?? user?.name ?? null,
          clientPan:  h.clientPan,
          phone:      user?.phone    ?? null,
          email:      user?.email    ?? null,
          uniqueId:   user?.uniqueId ?? null,
        },
        trades: h.trades,
      };
    });

    /* ---------- FILTER ---------- */
    if (within_days !== undefined) {
      const limit = Number(within_days);
      if (!isNaN(limit)) {
        holdings = holdings.filter(
          (h) => h.daysToMaturity !== null && h.daysToMaturity <= limit,
        );
      }
    }
    if (status) {
      holdings = holdings.filter((h) => h.status === status);
    }

    /* ---------- SORT: soonest maturity first; matured at top ---------- */
    holdings.sort((a, b) => {
      if (a.daysToMaturity === null) return 1;
      if (b.daysToMaturity === null) return -1;
      return a.daysToMaturity - b.daysToMaturity;
    });

    /* ---------- SUMMARY ---------- */
    const all = Object.values(holdingMap);
    const summary = { total: 0, matured: 0, maturing_30d: 0, maturing_60d: 0, maturing_90d: 0, active: 0, unknown: 0 };
    for (const h of all) {
      const d = parseMaturityDate(h.maturityDate);
      const s = d !== null ? maturityStatus(daysFromToday(d)) : "unknown";
      summary.total++;
      summary[s] = (summary[s] || 0) + 1;
    }

    return res.status(200).json({
      success:     true,
      generatedAt: new Date().toISOString(),
      filters:     { within_days: within_days ?? null, status: status ?? null },
      summary,
      count:       holdings.length,
      data:        holdings,
    });
  } catch (err) {
    console.error("❌ [BOND MATURITY REPORT] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
