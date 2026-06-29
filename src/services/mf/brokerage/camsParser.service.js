import fs from "fs/promises";
import os from "os";
import path from "path";
import crypto from "crypto";
import { DBFFile } from "dbffile";

const toMonthKey = (date) => {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/**
 * Parses a CAMS brokerage DBF file buffer into normalized commission rows.
 *
 * CAMS field names are truncated to 10 characters by the DBF format, which
 * produces a duplicate ('PREV_TRXN_' appears twice for different source
 * fields) — readMode 'loose' skips dbffile's strict-validation that would
 * otherwise reject the file outright.
 */
export const parseCamsBuffer = async (buffer) => {
  const tmpPath = path.join(os.tmpdir(), `cams-${crypto.randomUUID()}.dbf`);
  await fs.writeFile(tmpPath, buffer);

  try {
    const dbf = await DBFFile.open(tmpPath, { readMode: "loose", encoding: "latin1" });
    const rows = await dbf.readRecords();

    const records = [];
    for (const row of rows) {
      const brokerageAmount = Number(row.BRKAGE_AMT ?? 0);
      // Skip zero/negative-only noise rows with no actual commission
      if (!brokerageAmount) continue;

      const month = toMonthKey(row.BRKAGE_FRO) ?? toMonthKey(row.PROC_FROM_);
      if (!month) continue;

      records.push({
        source: "CAMS",
        month,
        amcCode: row.AMC_CODE?.trim() || null,
        folioNumber: row.FOLIO_NO?.trim() || null,
        schemeCode: row.SCHEME_COD?.trim() || null,
        investorName: row.INV_NAME?.trim() || null,
        transactionType: row.TRXN_TYPE?.trim() || null,
        transactionAmount: row.PLOT_AMOUN != null ? Number(row.PLOT_AMOUN) : null,
        units: row.PLOT_UNITS != null ? Number(row.PLOT_UNITS) : null,
        brokerageAmount,
        periodFrom: row.BRKAGE_FRO ?? null,
        periodTo: row.BRKAGE_TO ?? null,
        postedDate: row.BRK_POSTED ?? null,
        arnCode: row.BROK_CODE?.trim() || null,
      });
    }

    return records;
  } finally {
    await fs.unlink(tmpPath).catch(() => {});
  }
};
