import RegistrationUser from "../../models/user/user.model.js";
import { getBondDetails } from "../../utils/bonds/bondDetails.utils.js";
import isindata from "../../models/bonds/isin.model.js";
import { computeTradeCashflows, parseBondDate, startOfToday } from "../../utils/bonds/holdingCashflows.utils.js";

/* ================================================================
 * BW USER — BOND PORTFOLIO
 * GET /api/bw/bonds/portfolio
 * ================================================================ */
export const getBwBondPortfolio = async (req, res) => {
  try {
    const { uniqueId } = req.user;

    const user = await RegistrationUser.findOne(
      { uniqueId },
      { _id: 0, panNumber: 1, bondKycStatus: 1 },
    ).lean();

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (user.bondKycStatus !== "APPROVED") {
      return res.status(403).json({
        success: false,
        message: "Bond KYC not approved yet",
        bondKycStatus: user.bondKycStatus || "PENDING",
      });
    }

    if (!user.panNumber) {
      return res.status(400).json({
        success: false,
        message: "PAN not found. Please complete Bond KYC.",
      });
    }

    const portfolio = await getBondDetails(user.panNumber);

    if (!portfolio.length) {
      return res.status(200).json({
        success: true,
        message: "No bond investments found",
        data: [],
      });
    }

    return res.status(200).json({ success: true, data: portfolio });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ================================================================
 * BW USER — BOND PORTFOLIO SUMMARY (analytics)
 * GET /api/bw/bonds/portfolio/summary
 *
 * One call for the app's "My Bonds" section:
 *   totals   — invested (active), earned till now, avg return % p.a.,
 *              interest still to come, avg monthly income, next payout
 *   monthlyCashflow — next 12 months: interest + principal per month
 *   upcomingPayouts — next payouts across all bonds
 *   active / matured — per-bond details
 *
 * "Earned till now" = interest received on active bonds
 *                   + net gain on matured bonds (total received − invested).
 * "Avg return"      = client yield (YTM at purchase) weighted by amount invested.
 * ================================================================ */

const num  = (v) => Number(String(v ?? "").replace("%", "").trim()) || 0;
const r2   = (v) => Math.round(v * 100) / 100;
const ymKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export const getBwBondPortfolioSummary = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const user = await RegistrationUser.findOne(
      { uniqueId },
      { _id: 0, panNumber: 1, bondKycStatus: 1 },
    ).lean();

    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    if (user.bondKycStatus !== "APPROVED") {
      return res.status(403).json({
        success: false,
        message: "Bond KYC not approved yet",
        bondKycStatus: user.bondKycStatus || "PENDING",
      });
    }
    if (!user.panNumber) {
      return res.status(400).json({ success: false, message: "PAN not found. Please complete Bond KYC." });
    }

    const holdings = await getBondDetails(user.panNumber);
    const today = startOfToday();
    const in12m = new Date(today); in12m.setMonth(in12m.getMonth() + 12);

    // Cashflow tables for all ISINs in one query
    const isins = [...new Set(holdings.map((h) => String(h.isin).trim().toUpperCase()))];
    const bondDocs = isins.length ? await isindata.find({ isin: { $in: isins } }).lean() : [];
    const bondByIsin = Object.fromEntries(bondDocs.map((b) => [String(b.isin).toUpperCase(), b]));

    const active = [];
    const matured = [];
    const futureEvents = []; // {date, isin, issuerName, interest, principal}

    for (const h of holdings) {
      const bond = bondByIsin[String(h.isin).trim().toUpperCase()];
      let invested = 0, units = 0, yieldWeighted = 0;
      let interestReceived = 0, principalReturned = 0, interestAhead = 0, principalAhead = 0;
      let firstTradeDate = null;
      const events = [];

      for (const t of h.trades || []) {
        const tUnits = num(t.units);
        const tInvested = num(t.totalPurchase);
        invested += tInvested;
        units += tUnits;
        yieldWeighted += num(t.clientYield) * tInvested;
        const tradeDate = parseBondDate(t.tradeDate);
        if (tradeDate && (!firstTradeDate || tradeDate < firstTradeDate)) firstTradeDate = tradeDate;
        if (!bond || !tradeDate) continue;

        const { interestTillToday, principalTillToday, schedule } = computeTradeCashflows(bond, tUnits, tradeDate, today);
        interestReceived += interestTillToday;
        principalReturned += principalTillToday;
        for (const ev of schedule) {
          if (ev.paid) continue;
          interestAhead += ev.interestAmount;
          principalAhead += ev.principalAmount;
          events.push({ date: ev.date, interest: ev.interestAmount, principal: ev.principalAmount });
        }
      }

      const maturityDate = parseBondDate(h.maturityDate);
      const isMatured = maturityDate ? maturityDate <= today : events.length === 0 && !!bond;
      const avgYield = invested > 0 ? yieldWeighted / invested : 0;
      const coupon = num(h.trades?.[0]?.coupon);

      // Next payout for this bond (sum same-date events across trades)
      const byDate = new Map();
      for (const ev of events) {
        const k = ev.date.getTime();
        const cur = byDate.get(k) || { date: ev.date, interest: 0, principal: 0 };
        cur.interest += ev.interest; cur.principal += ev.principal;
        byDate.set(k, cur);
      }
      const sortedEvents = [...byDate.values()].sort((a, b) => a.date - b.date);
      const next = sortedEvents[0] || null;

      const base = {
        isin: h.isin,
        issuerName: h.issuerName,
        creditRating: h.creditRating || null,
        maturityDate: h.maturityDate,
        firstTradeDate: firstTradeDate ? firstTradeDate.toISOString() : null,
        units: r2(units),
        invested: r2(invested),
        coupon: r2(coupon),
        avgYield: r2(avgYield),
        interestReceived: r2(interestReceived),
        principalReturned: r2(principalReturned),
        hasCashflowData: !!bond,
      };

      if (isMatured) {
        const totalReceived = interestReceived + principalReturned;
        matured.push({
          ...base,
          totalReceived: r2(totalReceived),
          netGain: r2(totalReceived - invested),
          netGainPct: invested > 0 ? r2(((totalReceived - invested) / invested) * 100) : 0,
        });
      } else {
        active.push({
          ...base,
          interestAhead: r2(interestAhead),
          principalAhead: r2(principalAhead),
          nextPayout: next ? { date: next.date.toISOString(), interest: r2(next.interest), principal: r2(next.principal), total: r2(next.interest + next.principal) } : null,
        });
        for (const ev of sortedEvents) {
          futureEvents.push({ date: ev.date, isin: h.isin, issuerName: h.issuerName, interest: ev.interest, principal: ev.principal });
        }
      }
    }

    // ── Monthly cashflow: next 12 months (including the current month) ──
    const months = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
      months.push({ month: ymKey(d), interest: 0, principal: 0 });
    }
    const monthIdx = Object.fromEntries(months.map((m, i) => [m.month, i]));
    for (const ev of futureEvents) {
      const i = monthIdx[ymKey(ev.date)];
      if (i === undefined) continue;
      months[i].interest += ev.interest;
      months[i].principal += ev.principal;
    }
    const monthlyCashflow = months.map((m) => ({ month: m.month, interest: r2(m.interest), principal: r2(m.principal), total: r2(m.interest + m.principal) }));

    futureEvents.sort((a, b) => a.date - b.date);
    const upcomingPayouts = futureEvents.slice(0, 6).map((e) => ({
      date: e.date.toISOString(), isin: e.isin, issuerName: e.issuerName,
      interest: r2(e.interest), principal: r2(e.principal), total: r2(e.interest + e.principal),
    }));

    // ── Totals ──
    const sum = (arr, k) => arr.reduce((s, x) => s + (x[k] || 0), 0);
    const activeInvested = sum(active, "invested");
    const activeYieldWeighted = active.reduce((s, x) => s + x.avgYield * x.invested, 0);
    const next12mInterest = monthlyCashflow.reduce((s, m) => s + m.interest, 0);
    const earnedTillNow = sum(active, "interestReceived") + sum(matured, "netGain");

    const totals = {
      activeCount: active.length,
      maturedCount: matured.length,
      invested: r2(activeInvested),                                    // money currently in active bonds
      outstandingPrincipal: r2(activeInvested - sum(active, "principalReturned")),
      earnedTillNow: r2(earnedTillNow),
      interestReceived: r2(sum(active, "interestReceived") + sum(matured, "interestReceived")),
      avgReturnPct: activeInvested > 0 ? r2(activeYieldWeighted / activeInvested) : 0,
      interestAhead: r2(sum(active, "interestAhead")),
      next12MonthsInterest: r2(next12mInterest),
      avgMonthlyIncome: r2(next12mInterest / 12),
      nextPayout: upcomingPayouts[0] || null,
      maturedInvested: r2(sum(matured, "invested")),
      maturedReceived: r2(sum(matured, "totalReceived")),
    };

    active.sort((a, b) => (parseBondDate(a.maturityDate) || 0) - (parseBondDate(b.maturityDate) || 0));
    matured.sort((a, b) => (parseBondDate(b.maturityDate) || 0) - (parseBondDate(a.maturityDate) || 0));

    return res.status(200).json({
      success: true,
      data: { asOn: today.toISOString(), totals, monthlyCashflow, upcomingPayouts, active, matured },
    });
  } catch (error) {
    console.error("❌ [BW BOND SUMMARY] Error:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};
