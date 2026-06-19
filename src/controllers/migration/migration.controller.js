import mongoose from "mongoose";
import xlsx from "xlsx";

import MigrationBatch from "../../models/migration/migrationBatch.model.js";
import MigrationRecord from "../../models/migration/migrationRecord.model.js";
import RegistrationUser from "../../models/user/user.model.js";
import { mapExcelRowToMigrationInput } from "../../services/migration/fieldMapper.service.js";
import { processMigrationRecord } from "../../services/migration/migrationRunner.service.js";

/* ------------------------------------------------------------------ */
/*  Internal — recompute status counts for a batch from its records     */
/* ------------------------------------------------------------------ */
const computeBatchCounts = async (batchId) => {
  const agg = await MigrationRecord.aggregate([
    { $match: { batchId: new mongoose.Types.ObjectId(batchId) } },
    { $group: { _id: "$overallStatus", count: { $sum: 1 } } },
  ]);

  const counts = { pending: 0, completed: 0, partial: 0, failed: 0, manualReview: 0, alreadyExists: 0 };
  for (const a of agg) {
    if (a._id === "manual_review")      counts.manualReview = a.count;
    else if (a._id === "already_exists") counts.alreadyExists = a.count;
    else if (a._id === "in_progress")   counts.pending += a.count;
    else if (counts[a._id] !== undefined) counts[a._id] = a.count;
    else counts.pending += a.count;
  }
  return counts;
};

/* ------------------------------------------------------------------ */
/*  Internal — process every unfinished record in a batch sequentially  */
/*  (sequential, not parallel — avoids hammering FP/Cybrilla rate limits)*/
/* ------------------------------------------------------------------ */
const processBatch = async (batchId) => {
  await MigrationBatch.findByIdAndUpdate(batchId, {
    $set: { status: "processing", startedAt: new Date() },
  });

  const records = await MigrationRecord.find({
    batchId,
    overallStatus: { $in: ["pending", "in_progress", "partial", "failed"] },
  });

  console.log(`🚀 [MIGRATION] Batch ${batchId} — processing ${records.length} record(s)`);

  for (const record of records) {
    try {
      const { data } = mapExcelRowToMigrationInput(record.rawRow);
      if (!data) continue; // defensive — manual_review rows are excluded by the query above
      await processMigrationRecord(record, data);
    } catch (err) {
      console.error(`❌ [MIGRATION] Row ${record.rowNumber} (record ${record._id}) crashed:`, err.message);
    }
  }

  const counts = await computeBatchCounts(batchId);
  const status = counts.failed > 0 || counts.partial > 0 ? "completed_with_errors" : "completed";

  await MigrationBatch.findByIdAndUpdate(batchId, {
    $set: { status, counts, completedAt: new Date() },
  });

  console.log(`✅ [MIGRATION] Batch ${batchId} — ${status}`, counts);
};

/* ================================================================
 * POST /api/migration/upload
 * Form fields: file (multipart, .xlsx)
 * ================================================================ */
export const uploadMigrationFile = async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, message: "No file uploaded. Use field name 'file'" });
    }

    const wb = xlsx.read(file.buffer, { type: "buffer" });
    const sheetName = wb.SheetNames[0];
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { defval: null });

    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: "Excel file has no data rows" });
    }

    const batch = await MigrationBatch.create({
      fileName:   file.originalname,
      uploadedBy: req.admin?.uniqueId ?? null,
      totalRows:  rows.length,
      status:     "queued",
    });

    const recordDocs = rows.map((row, idx) => {
      const { data, manualReviewReason } = mapExcelRowToMigrationInput(row);
      return {
        batchId:   batch._id,
        rowNumber: idx + 1,
        rawRow:    row,
        phone:     data?.phone ?? null,
        pan:       data?.pan   ?? null,
        name:      data?.fullName ?? null,
        overallStatus: manualReviewReason ? "manual_review" : "pending",
        manualReviewReason,
      };
    });

    // Skip rows whose phone is already a registered user — one bulk lookup,
    // not per-row, so this stays fast even on large sheets.
    const phonesToCheck = recordDocs
      .filter((r) => r.overallStatus === "pending" && r.phone)
      .map((r) => r.phone);

    if (phonesToCheck.length > 0) {
      const existingUsers = await RegistrationUser.find(
        { phone: { $in: phonesToCheck } },
        { phone: 1 },
      ).lean();
      const existingPhones = new Set(existingUsers.map((u) => u.phone));

      for (const r of recordDocs) {
        if (r.overallStatus === "pending" && existingPhones.has(r.phone)) {
          r.overallStatus = "already_exists";
        }
      }
    }

    await MigrationRecord.insertMany(recordDocs);

    // Kick off background processing — response returns immediately.
    // processBatch only picks up pending/in_progress/partial/failed rows,
    // so manual_review and already_exists rows are never touched.
    processBatch(batch._id).catch((err) =>
      console.error(`❌ [MIGRATION] Batch ${batch._id} processing crashed:`, err.message),
    );

    return res.status(202).json({
      success: true,
      message: "File uploaded. Migration is processing in the background.",
      batchId: batch._id,
      totalRows: rows.length,
      manualReviewCount:  recordDocs.filter((r) => r.overallStatus === "manual_review").length,
      alreadyExistsCount: recordDocs.filter((r) => r.overallStatus === "already_exists").length,
    });
  } catch (err) {
    console.error("❌ [MIGRATION] Upload error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ================================================================
 * GET /api/migration/batches
 * ================================================================ */
export const listBatches = async (req, res) => {
  try {
    const batches = await MigrationBatch.find().sort({ createdAt: -1 }).lean();
    return res.status(200).json({ success: true, count: batches.length, data: batches });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ================================================================
 * GET /api/migration/batches/:batchId
 * ================================================================ */
export const getBatch = async (req, res) => {
  try {
    const { batchId } = req.params;
    const batch = await MigrationBatch.findById(batchId).lean();
    if (!batch) return res.status(404).json({ success: false, message: "Batch not found" });

    const counts = await computeBatchCounts(batchId);
    return res.status(200).json({ success: true, data: { ...batch, counts } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ================================================================
 * GET /api/migration/batches/:batchId/records?status=
 * ================================================================ */
export const listRecords = async (req, res) => {
  try {
    const { batchId } = req.params;
    const { status } = req.query;

    const filter = { batchId };
    if (status) filter.overallStatus = status;

    const records = await MigrationRecord.find(filter)
      .select("-rawRow")
      .sort({ rowNumber: 1 })
      .lean();

    return res.status(200).json({ success: true, count: records.length, data: records });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ================================================================
 * GET /api/migration/records/:recordId
 * ================================================================ */
export const getRecord = async (req, res) => {
  try {
    const { recordId } = req.params;
    const record = await MigrationRecord.findById(recordId).lean();
    if (!record) return res.status(404).json({ success: false, message: "Record not found" });
    return res.status(200).json({ success: true, data: record });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ================================================================
 * POST /api/migration/records/:recordId/retry
 * Resumes the pipeline from the first incomplete step — already
 * completed steps are skipped (each step checks FP for existing
 * objects before creating new ones).
 * ================================================================ */
export const retryRecord = async (req, res) => {
  try {
    const { recordId } = req.params;
    const record = await MigrationRecord.findById(recordId);
    if (!record) return res.status(404).json({ success: false, message: "Record not found" });

    if (record.overallStatus === "completed") {
      return res.status(400).json({ success: false, message: "Record already completed" });
    }

    const { data, manualReviewReason } = mapExcelRowToMigrationInput(record.rawRow);
    if (manualReviewReason) {
      record.overallStatus = "manual_review";
      record.manualReviewReason = manualReviewReason;
      await record.save();
      return res.status(200).json({ success: true, message: "Still requires manual review", data: record });
    }

    await processMigrationRecord(record, data);
    return res.status(200).json({ success: true, data: record });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ================================================================
 * POST /api/migration/batches/:batchId/retry-failed
 * Re-runs every non-completed, non-manual-review record in the batch.
 * ================================================================ */
export const retryFailedInBatch = async (req, res) => {
  try {
    const { batchId } = req.params;
    const batch = await MigrationBatch.findById(batchId);
    if (!batch) return res.status(404).json({ success: false, message: "Batch not found" });

    processBatch(batchId).catch((err) =>
      console.error(`❌ [MIGRATION] Retry for batch ${batchId} crashed:`, err.message),
    );

    return res.status(202).json({ success: true, message: "Retry started in background" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
