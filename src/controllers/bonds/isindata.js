import XLSX from "xlsx";
import isindata from "../../models/bonds/isin.model.js";

export const uploadBondExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Excel file is required",
      });
    }

    // 1. Improved Read Options: cellDates ensures Excel dates become JS Dates
    const workbook = XLSX.read(req.file.buffer, {
      type: "buffer",
      cellDates: true,
      cellNF: true,
      cellText: true,
    });

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const range = XLSX.utils.decode_range(sheet["!ref"]);

    // Helper to get value from cell (Priority: Formatted Text > Raw Value)
    const getVal = (r, c) => {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (!cell) return "";
      // If it's a date object, we might want to format it specifically
      if (cell.t === "d") return cell.w || cell.v.toLocaleDateString("en-GB");
      return cell.w
        ? String(cell.w).trim()
        : cell.v !== undefined
          ? String(cell.v).trim()
          : "";
    };

    /* ---------- BOND MASTER (H → I) ---------- */
    let isin, issuerName, faceValue, ytm, coupon;

    for (let r = range.s.r; r <= range.e.r; r++) {
      const key = getVal(r, 7); // Column H
      const value = getVal(r, 8); // Column I

      if (!key || !value) continue;

      switch (key) {
        case "ISIN":
          isin = value;
          break;
        case "Issuer":
          issuerName = value;
          break;
        case "Face Value":
          faceValue = value;
          break;
        case "YTM":
          ytm = value;
          break;
        case "Coupon":
          coupon = value;
          break;
      }
    }

    if (!isin || !issuerName || !faceValue || !ytm || !coupon) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid Excel format" });
    }

    /* ---------- CASHFLOWS ---------- */
    const cashflows = [];
    let headerRowIndex = -1;

    for (let r = range.s.r; r <= range.e.r; r++) {
      if (
        getVal(r, 0) === "Cashflow Date" &&
        getVal(r, 1) === "Cashflow Amount"
      ) {
        headerRowIndex = r;
        break;
      }
    }

    if (headerRowIndex === -1) {
      return res
        .status(400)
        .json({ success: false, message: "Cashflow header not found" });
    }

    for (let r = headerRowIndex + 1; r <= range.e.r; r++) {
      const dateVal = getVal(r, 0);
      const amountVal = getVal(r, 1);

      // Skip row if both date and amount are effectively empty
      if (!dateVal || dateVal === "0") continue;

      cashflows.push({
        cashflowDate: dateVal,
        cashflowAmount: amountVal,
        recordDate: getVal(r, 2),
        principalAmount: getVal(r, 3),
        interestAmount: getVal(r, 4),
      });
    }

    const bond = await isindata.create({
      isin,
      issuerName,
      faceValue,
      ytm,
      couponRate: coupon,
      cashflows,
    });

    return res.status(201).json({ success: true, data: bond });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
