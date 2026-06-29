import XLSX from "xlsx";

/** "dd/mm/yyyy" or "dd/mm/yy" → Date */
const parseDdMmYyyy = (value) => {
  if (!value) return null;
  const m = String(value).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yearPart] = m;
  const yyyy = yearPart.length === 2 ? 2000 + Number(yearPart) : Number(yearPart);
  return new Date(yyyy, Number(mm) - 1, Number(dd));
};

const toMonthKey = (date) => {
  if (!date) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

/**
 * "UTI Nifty Index Fund - GROWTH PLAN" → "UTI Nifty Index"
 * Just a hint for admin to confirm in AmcCodeMap — not used for grouping
 * directly, since it's per-scheme, not a clean parent-AMC name.
 */
const deriveSuggestedName = (fundDescription) => {
  if (!fundDescription) return null;
  return fundDescription.split(/\bfund\b/i)[0].trim() || fundDescription.trim();
};

/**
 * Parses a KARVY brokerage CSV file buffer into normalized commission rows.
 * Reuses the xlsx package (already a dependency) — it reads CSV from a
 * buffer directly, no temp file needed.
 */
export const parseKarvyBuffer = (buffer) => {
  // raw:true + cellText:true — xlsx otherwise "smart"-reformats date-like
  // columns inconsistently (e.g. "01/05/2026" -> "1/5/26" on some rows but
  // not others), silently breaking date parsing for a chunk of rows.
  const workbook = XLSX.read(buffer, { type: "buffer", raw: true, cellDates: false, cellText: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });

  const records = [];
  for (const row of rows) {
    const brokerageAmount = Number(row["Brokerage (in Rs.)"] ?? 0);
    if (!brokerageAmount) continue;

    const periodFrom = parseDdMmYyyy(row["From Date"]);
    const periodTo = parseDdMmYyyy(row["To Date"]);
    const month = toMonthKey(periodFrom);
    if (!month) continue;

    records.push({
      source: "KARVY",
      month,
      amcCode: row["Fund"]?.trim() || null,
      suggestedAmcName: deriveSuggestedName(row["Fund Description"]),
      folioNumber: row["Account Number"]?.trim() || null,
      schemeCode: row["Scheme Code"]?.trim() || row["Scheme"]?.trim() || null,
      investorName: row["Investor Name"]?.trim() || null,
      transactionType: row["Transaction Description"]?.trim() || null,
      transactionAmount: row["Amount (in Rs.)"] != null ? Number(row["Amount (in Rs.)"]) : null,
      units: row["Units"] != null ? Number(row["Units"]) : null,
      brokerageAmount,
      periodFrom,
      periodTo,
      postedDate: parseDdMmYyyy(row["Process Date"]),
      arnCode: row["Sub-Broker"]?.trim() || null,
    });
  }

  return records;
};
