import BrokerageUpload from "../../../../models/mf/brokerage/brokerageUpload.model.js";
import BrokerageRecord from "../../../../models/mf/brokerage/brokerageRecord.model.js";
import AmcCodeMap from "../../../../models/mf/brokerage/amcCodeMap.model.js";
import MfUserData from "../../../../models/mf/mfUserData.model.js";
import { fetchFpFolios } from "../../../../utils/mf/folio.utils.js";
import { parseCamsBuffer } from "../../../../services/mf/brokerage/camsParser.service.js";
import { parseKarvyBuffer } from "../../../../services/mf/brokerage/karvyParser.service.js";

/* ------------------------------------------------------------------ */
/*  Internal — resolve folio_number → uniqueId for every distinct       */
/*  folio in this batch, in two round trips total regardless of how     */
/*  many records there are (one FP folio list call, one local PAN       */
/*  lookup) — same approach as the transaction list report.            */
/* ------------------------------------------------------------------ */
const resolveUniqueIds = async (records) => {
  const folioNumbers = [...new Set(records.map((r) => r.folioNumber).filter(Boolean))];
  if (folioNumbers.length === 0) return {};

  const fpFolios = await fetchFpFolios();
  const allFolios = fpFolios?.data ?? [];

  const folioToPan = {};
  for (const f of allFolios) {
    if (folioNumbers.includes(f.number) && f.primary_investor_pan) {
      folioToPan[f.number] = f.primary_investor_pan.toUpperCase().trim();
    }
  }

  const pans = [...new Set(Object.values(folioToPan))];
  if (pans.length === 0) return {};

  const users = await MfUserData.find(
    { "investorProfile.pan": { $in: pans } },
    { uniqueId: 1, "investorProfile.pan": 1 },
  ).lean();
  const panToUniqueId = Object.fromEntries(users.map((u) => [u.investorProfile.pan, u.uniqueId]));

  const folioToUniqueId = {};
  for (const [folio, pan] of Object.entries(folioToPan)) {
    if (panToUniqueId[pan]) folioToUniqueId[folio] = panToUniqueId[pan];
  }
  return folioToUniqueId;
};

/* ------------------------------------------------------------------ */
/*  Internal — resolve amcCode → amcName via AmcCodeMap, auto-seeding   */
/*  any never-seen code (with a suggested name for KARVY, null for      */
/*  CAMS) so admin sees it waiting for confirmation immediately.        */
/* ------------------------------------------------------------------ */
const resolveAmcNames = async (source, records) => {
  const codes = [...new Set(records.map((r) => r.amcCode).filter(Boolean))];
  if (codes.length === 0) return {};

  const existing = await AmcCodeMap.find({ source, code: { $in: codes } }).lean();
  const existingCodes = new Set(existing.map((m) => m.code));

  const toCreate = [];
  for (const code of codes) {
    if (existingCodes.has(code)) continue;
    const sample = records.find((r) => r.amcCode === code);
    toCreate.push({ source, code, amcName: null, suggestedName: sample?.suggestedAmcName ?? null });
  }
  if (toCreate.length > 0) {
    await AmcCodeMap.insertMany(toCreate, { ordered: false }).catch(() => {});
  }

  const allMaps = await AmcCodeMap.find({ source, code: { $in: codes } }).lean();
  return Object.fromEntries(allMaps.map((m) => [m.code, m.amcName ?? m.suggestedName ?? null]));
};

/* ================================================================
 * POST /api/mf/admin/brokerage/upload
 * Form fields: file (multipart), source ("CAMS" | "KARVY")
 * ================================================================ */
export const uploadBrokerageFile = async (req, res) => {
  let upload;
  try {
    const file = req.file;
    const { source } = req.body;

    if (!file) {
      return res.status(400).json({ success: false, message: "No file uploaded. Use field name 'file'" });
    }
    if (!["CAMS", "KARVY"].includes(source)) {
      return res.status(400).json({ success: false, message: "source must be CAMS or KARVY" });
    }

    upload = await BrokerageUpload.create({
      source,
      fileName: file.originalname,
      uploadedBy: req.admin?.uniqueId ?? null,
      status: "processing",
    });

    const parsed = source === "CAMS"
      ? await parseCamsBuffer(file.buffer)
      : parseKarvyBuffer(file.buffer);

    if (parsed.length === 0) {
      await BrokerageUpload.findByIdAndUpdate(upload._id, {
        $set: { status: "failed", error: "No commission rows found in file" },
      });
      return res.status(400).json({ success: false, message: "No commission rows found in this file" });
    }

    const [folioToUniqueId, amcCodeToName] = await Promise.all([
      resolveUniqueIds(parsed),
      resolveAmcNames(source, parsed),
    ]);

    const months = [...new Set(parsed.map((r) => r.month))].sort();
    const totalBrokerage = parsed.reduce((sum, r) => sum + r.brokerageAmount, 0);

    const docs = parsed.map((r) => ({
      uploadId: upload._id,
      source: r.source,
      month: r.month,
      amcCode: r.amcCode,
      amcName: r.amcCode ? amcCodeToName[r.amcCode] ?? null : null,
      folioNumber: r.folioNumber,
      schemeCode: r.schemeCode,
      investorName: r.investorName,
      transactionType: r.transactionType,
      transactionAmount: r.transactionAmount,
      units: r.units,
      brokerageAmount: r.brokerageAmount,
      periodFrom: r.periodFrom,
      periodTo: r.periodTo,
      postedDate: r.postedDate,
      arnCode: r.arnCode,
      uniqueId: r.folioNumber ? folioToUniqueId[r.folioNumber] ?? null : null,
    }));

    await BrokerageRecord.insertMany(docs, { ordered: false });

    const updated = await BrokerageUpload.findByIdAndUpdate(
      upload._id,
      {
        $set: {
          status: "completed",
          totalRecords: docs.length,
          totalBrokerage: Math.round(totalBrokerage * 100) / 100,
          months,
        },
      },
      { new: true },
    );

    return res.status(201).json({
      success: true,
      message: `Processed ${docs.length} commission record(s) across ${months.length} month(s)`,
      data: updated,
    });
  } catch (err) {
    console.error("❌ [BROKERAGE UPLOAD] Error:", err.message);
    if (upload) {
      await BrokerageUpload.findByIdAndUpdate(upload._id, { $set: { status: "failed", error: err.message } });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ================================================================
 * GET /api/mf/admin/brokerage/uploads
 * ================================================================ */
export const listBrokerageUploads = async (req, res) => {
  try {
    const uploads = await BrokerageUpload.find().sort({ createdAt: -1 }).lean();
    return res.status(200).json({ success: true, count: uploads.length, data: uploads });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
