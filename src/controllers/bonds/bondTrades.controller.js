import XLSX from "xlsx";
import BondTrade from "../../models/bonds/bondTrade.model.js";

export const uploadBondTradesExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Excel file is required",
      });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const range = XLSX.utils.decode_range(sheet["!ref"]);

    let inserted = 0;
    let skipped = 0;

    // Start from row 2 (index 1) → skip header
    for (let r = range.s.r + 1; r <= range.e.r; r++) {
      const tradeIdCell = sheet[XLSX.utils.encode_cell({ r, c: 0 })]; // A

      if (!tradeIdCell?.w) continue;

      const tradeId = String(tradeIdCell.w).trim();

      // 🔑 Check duplicate tradeId
      const exists = await BondTrade.findOne({ tradeId });
      if (exists) {
        skipped++;
        continue; // ⬅️ silently skip
      }

      const trade = {
        tradeId,

        tradeDate: sheet[XLSX.utils.encode_cell({ r, c: 1 })]?.w || "",
        clientName: sheet[XLSX.utils.encode_cell({ r, c: 2 })]?.w || "",
        clientPan: sheet[XLSX.utils.encode_cell({ r, c: 3 })]?.w || "",
        rmName: sheet[XLSX.utils.encode_cell({ r, c: 4 })]?.w || "",
        issuerName: sheet[XLSX.utils.encode_cell({ r, c: 5 })]?.w || "",
        isin: sheet[XLSX.utils.encode_cell({ r, c: 6 })]?.w || "",

        faceValue: sheet[XLSX.utils.encode_cell({ r, c: 7 })]?.w || "",
        coupon: sheet[XLSX.utils.encode_cell({ r, c: 8 })]?.w || "",
        allInYield: sheet[XLSX.utils.encode_cell({ r, c: 9 })]?.w || "",
        clientYield: sheet[XLSX.utils.encode_cell({ r, c: 10 })]?.w || "",

        units: sheet[XLSX.utils.encode_cell({ r, c: 11 })]?.w || "",
        totalPurchase: sheet[XLSX.utils.encode_cell({ r, c: 12 })]?.w || "",
        distributionFee: sheet[XLSX.utils.encode_cell({ r, c: 13 })]?.w || "",
        channel: sheet[XLSX.utils.encode_cell({ r, c: 14 })]?.w || "",
        creditRating: sheet[XLSX.utils.encode_cell({ r, c: 15 })]?.w || "",

        maturityDate: sheet[XLSX.utils.encode_cell({ r, c: 16 })]?.w || "",
        yieldToOption: sheet[XLSX.utils.encode_cell({ r, c: 17 })]?.w || "",
        optionDate: sheet[XLSX.utils.encode_cell({ r, c: 18 })]?.w || "",
      };

      await BondTrade.create(trade);
      inserted++;
    }

    return res.status(201).json({
      success: true,
      message: "Bond trades upload completed",
      summary: {
        inserted,
        skipped,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
