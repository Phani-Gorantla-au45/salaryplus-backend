import BondTrade from "../../../models/bonds/bondTrade.model.js";

export const getBondDetails = async (pan) => {
  if (!pan) {
    throw new Error("PAN is required");
  }

  const trades = await BondTrade.find({ clientPan: pan }).lean();

  if (!trades || trades.length === 0) {
    return [];
  }

  const groupedByIsin = {};

  for (const trade of trades) {
    const isin = trade.isin;

    if (!groupedByIsin[isin]) {
      groupedByIsin[isin] = {
        isin,
        issuerName: trade.issuerName,
        creditRating: trade.creditRating,
        maturityDate: trade.maturityDate,
        trades: [],
      };
    }

    groupedByIsin[isin].trades.push({
      tradeId: trade.tradeId,
      tradeDate: trade.tradeDate,
      units: trade.units,
      faceValue: trade.faceValue,
      coupon: trade.coupon,
      clientYield: trade.clientYield,
      totalPurchase: trade.totalPurchase,
    });
  }

  return Object.values(groupedByIsin);
};
