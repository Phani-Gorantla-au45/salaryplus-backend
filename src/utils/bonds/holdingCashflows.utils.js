/* ====================================================================
 *  Bond holding cashflows — shared by:
 *    POST /api/bonddetails/profile/holding   (per trade)
 *    GET  /api/bw/bonds/portfolio/summary    (whole portfolio analytics)
 *
 *  Rule (unchanged from the original holding-profile endpoint):
 *    a cashflow belongs to the investor if its recordDate >= tradeDate;
 *    amounts = per-unit interest/principal × units;
 *    cashflowDate <= today → already paid ("till today").
 * ==================================================================== */

const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

/** "7-Aug-2026" → Date (local midnight) | null */
export const parseBondDate = (value) => {
  if (!value || typeof value !== "string") return null;
  if (!/^\d{1,2}-[A-Za-z]{3}-\d{4}$/.test(value.trim())) return null;
  const [day, mon, year] = value.trim().split("-");
  const m = mon.charAt(0).toUpperCase() + mon.slice(1).toLowerCase();
  if (!(m in MONTHS)) return null;
  return new Date(Number(year), MONTHS[m], Number(day), 0, 0, 0, 0);
};

export const startOfToday = () => {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
};

/**
 * Cashflows for one trade of a bond.
 * @returns {{ interestTillToday:number, principalTillToday:number,
 *             schedule: Array<{cashflowDate:string, recordDate:string, date:Date,
 *                              interestAmount:number, principalAmount:number, totalAmount:number, paid:boolean}> }}
 */
export const computeTradeCashflows = (bond, units, tradeDateObj, today = startOfToday()) => {
  let interestTillToday = 0;
  let principalTillToday = 0;
  const schedule = [];

  for (const cf of bond?.cashflows || []) {
    const recordDateObj   = parseBondDate(cf.recordDate);
    const cashflowDateObj = parseBondDate(cf.cashflowDate);
    if (!recordDateObj || !cashflowDateObj) continue;
    if (recordDateObj < tradeDateObj) continue; // before the investor held it

    const interest  = Number(cf.interestAmount  || 0) * Number(units);
    const principal = Number(cf.principalAmount || 0) * Number(units);
    const paid = cashflowDateObj <= today;
    if (paid) {
      interestTillToday  += interest;
      principalTillToday += principal;
    }
    schedule.push({
      cashflowDate: cf.cashflowDate,
      recordDate:   cf.recordDate,
      date:         cashflowDateObj,
      interestAmount:  interest,
      principalAmount: principal,
      totalAmount:     interest + principal,
      paid,
    });
  }

  schedule.sort((a, b) => a.date - b.date);
  return { interestTillToday, principalTillToday, schedule };
};
