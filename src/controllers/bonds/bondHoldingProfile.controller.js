// import isindata from "../../models/bonds/isin.model.js";

// /* ---------- SAFE DATE PARSER (DD-MMM-YYYY ONLY) ---------- */
// const parseDate = (value) => {
//   if (!value || typeof value !== "string") return null;

//   // Accept only formats like 21-Feb-2026
//   const regex = /^\d{1,2}-[A-Za-z]{3}-\d{4}$/;
//   if (!regex.test(value)) return null;

//   const [day, mon, year] = value.split("-");

//   const monthMap = {
//     Jan: 0,
//     Feb: 1,
//     Mar: 2,
//     Apr: 3,
//     May: 4,
//     Jun: 5,
//     Jul: 6,
//     Aug: 7,
//     Sep: 8,
//     Oct: 9,
//     Nov: 10,
//     Dec: 11,
//   };

//   return new Date(Number(year), monthMap[mon], Number(day));
// };

// /* ---------- BOND HOLDING PROFILE API ---------- */
// export const getBondHoldingProfile = async (req, res) => {
//   try {
//     const { isin, units, tradeDate } = req.body;

//     if (!isin || !units || !tradeDate) {
//       return res.status(400).json({
//         statusCode: 400,
//         message: "isin, units and tradeDate are required",
//       });
//     }

//     const bond = await isindata
//       .findOne({
//         isin: isin.trim().toUpperCase(),
//       })
//       .lean();

//     if (!bond) {
//       return res.status(404).json({
//         statusCode: 404,
//         message: "Bond not found for given ISIN",
//       });
//     }

//     const userTradeDate = parseDate(tradeDate);
//     if (!userTradeDate) {
//       return res.status(400).json({
//         statusCode: 400,
//         message: "Invalid tradeDate format (expected DD-MMM-YYYY)",
//       });
//     }

//     const today = new Date();

//     let interestPaidTillNow = 0;
//     let principalPaidTillNow = 0;
//     let nextPayoutDate = null;

//     const payoutSchedule = [];

//     for (const cf of bond.cashflows) {
//       const recordDate = parseDate(cf.recordDate);
//       const cashflowDate = parseDate(cf.cashflowDate);
//       console.log("rec date", recordDate);
//       console.log("cashflow date", cashflowDate);
//       console.log("usertarde", userTradeDate);
//       // 🚫 Skip invalid / garbage excel rows
//       if (!recordDate || !cashflowDate) continue;

//       // 🔒 ELIGIBILITY RULE (FINAL)
//       // tradeDate <= recordDate → eligible
//       if (userTradeDate > recordDate) continue;

//       if (cashflowDate <= today) {
//         const interest = Number(cf.interestAmount || 0) * Number(units);
//         const principal = Number(cf.principalAmount || 0) * Number(units);

//         interestPaidTillNow += interest;
//         principalPaidTillNow += principal;

//         payoutSchedule.push({
//           cashflowDate: cf.cashflowDate,
//           interestAmount: interest,
//           principalAmount: principal,
//         });
//       } else {
//         if (!nextPayoutDate || parseDate(nextPayoutDate) > cashflowDate) {
//           nextPayoutDate = cf.cashflowDate;
//         }
//       }
//     }

//     return res.status(200).json({
//       statusCode: 200,
//       message: "Bond holding details fetched successfully",
//       result: {
//         data: {
//           isin,
//           units,
//           interestPaidTillNow,
//           principalPaidTillNow,
//           nextPayoutDate,
//           payoutSchedule,
//         },
//       },
//     });
//   } catch (error) {
//     return res.status(500).json({
//       statusCode: 500,
//       message: error.message,
//     });
//   }
// };
import isindata from "../../models/bonds/isin.model.js";

/* ---------- SAFE DATE PARSER (DD-MMM-YYYY) ---------- */
const parseDate = (value) => {
  if (!value || typeof value !== "string") return null;

  const regex = /^\d{1,2}-[A-Za-z]{3}-\d{4}$/;
  if (!regex.test(value)) return null;

  const [day, mon, year] = value.split("-");

  const monthMap = {
    Jan: 0,
    Feb: 1,
    Mar: 2,
    Apr: 3,
    May: 4,
    Jun: 5,
    Jul: 6,
    Aug: 7,
    Sep: 8,
    Oct: 9,
    Nov: 10,
    Dec: 11,
  };

  const m = mon.charAt(0).toUpperCase() + mon.slice(1).toLowerCase();
  if (!(m in monthMap)) return null;

  return new Date(Number(year), monthMap[m], Number(day), 0, 0, 0, 0);
};

/* ---------- BOND HOLDING PROFILE API ---------- */
export const getBondHoldingProfile = async (req, res) => {
  try {
    const { isin, units, tradeDate } = req.body;

    /* ---------- BASIC VALIDATION ---------- */
    if (!isin || !units || !tradeDate) {
      return res.status(400).json({
        statusCode: 400,
        message: "isin, units and tradeDate are required",
      });
    }

    const tradeDateObj = parseDate(tradeDate);
    if (!tradeDateObj) {
      return res.status(400).json({
        statusCode: 400,
        message: "Invalid tradeDate format (expected DD-MMM-YYYY)",
      });
    }

    const bond = await isindata
      .findOne({ isin: isin.trim().toUpperCase() })
      .lean();

    if (!bond) {
      return res.status(404).json({
        statusCode: 404,
        message: "Bond not found for given ISIN",
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let totalInterestEarnedTillToday = 0;
    let totalPrincipalPaidTillToday = 0;

    const payoutSchedules = [];

    /* ---------- CORE LOGIC ---------- */
    for (const cf of bond.cashflows || []) {
      const recordDateObj = parseDate(cf.recordDate);
      const cashflowDateObj = parseDate(cf.cashflowDate);

      if (!recordDateObj || !cashflowDateObj) continue;

      /**
       * ❌ Ignore cashflows where
       * recordDate < tradeDate
       */
      if (recordDateObj < tradeDateObj) continue;

      const interest = Number(cf.interestAmount || 0) * Number(units);
      const principal = Number(cf.principalAmount || 0) * Number(units);

      /* ---------- PAST PAYOUTS ---------- */
      if (cashflowDateObj <= today) {
        totalInterestEarnedTillToday += interest;
        totalPrincipalPaidTillToday += principal;
      }

      /* ---------- PAYOUT SCHEDULE (ALL AFTER TRADE DATE) ---------- */
      payoutSchedules.push({
        cashflowDate: cf.cashflowDate,
        recordDate: cf.recordDate,
        interestAmount: interest,
        principalAmount: principal,
        totalAmount: interest + principal,
      });
    }

    /* ---------- SORT PAYOUT SCHEDULE BY DATE ---------- */
    payoutSchedules.sort((a, b) => {
      return parseDate(a.cashflowDate) - parseDate(b.cashflowDate);
    });

    return res.status(200).json({
      statusCode: 200,
      message: "Bond holding profile fetched successfully",
      result: {
        data: {
          isin,
          units,
          tradeDate,
          totalInterestEarnedTillToday,
          totalPrincipalPaidTillToday,
          payoutSchedules,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      statusCode: 500,
      message: error.message,
    });
  }
};
