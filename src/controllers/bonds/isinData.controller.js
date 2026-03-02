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
    const isValidExcelDateString = (value) => {
      if (!value || typeof value !== "string") return false;

      // Accept only: 21-Feb-2026
      return /^\d{1,2}-[A-Za-z]{3}-\d{4}$/.test(value);
    };

    if (headerRowIndex === -1) {
      return res
        .status(400)
        .json({ success: false, message: "Cashflow header not found" });
    }

    for (let r = headerRowIndex + 1; r <= range.e.r; r++) {
      const dateVal = getVal(r, 0);
      const amountVal = getVal(r, 1);

      // 🚫 Skip invalid cashflow rows
      if (!isValidExcelDateString(dateVal)) continue;

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
/* ---------------- GET BOND BY ISIN ---------------- */
export const getBondByIsin = async (req, res) => {
  try {
    const { isin } = req.params;

    if (!isin) {
      return res.status(400).json({
        success: false,
        message: "ISIN is required in URL",
      });
    }

    const bond = await isindata
      .findOne({ isin: isin.trim().toUpperCase() })
      .lean();

    if (!bond) {
      return res.status(404).json({
        success: false,
        message: "Bond not found for this ISIN",
      });
    }

    return res.status(200).json({
      success: true,
      data: bond,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
