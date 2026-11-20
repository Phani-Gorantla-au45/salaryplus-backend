import crypto from "crypto";
import FpLookup from "../../../models/mf/fpLookup.model.js";
import MfUserData from "../../../models/mf/mfUserData.model.js";
import User from "../../../models/user/user.model.js";
import {
  createFpLookup,
  fetchFpLookup,
  mapBankData,
  mapCustomerData,
  normaliseLookupStatus,
} from "../../../utils/mf/onboarding/lookup.utils.js";

/*
 * FP Lookup — pre-fill onboarding (KYC + MF account) from third-party data.
 *
 *   POST /api/mf/lookup   { consent: true, types?: ["customer_data","bank_account"], consentText?, consentMode? }
 *   The app sends this when the user taps the onboarding CTA, which shows the consent notice.
 *   The record carries the real tap time, IP and the exact text shown.
 *   GET  /api/mf/lookup   latest result of each type (refreshes pending ones)
 *
 * Cost control: a successful lookup is reused for REUSE_DAYS; at most
 * MAX_PER_DAY new FP calls per type per user per day.
 * Values are suggestions only — the user reviews/edits them in the forms.
 */

const REUSE_DAYS = 90;
const MAX_PER_DAY = 3;
const POLL_ATTEMPTS = 4;
const POLL_DELAY_MS = 2000;

export const LOOKUP_CONSENT_TEXT = {
  customer_data:
    "I allow Bharat Wealth to fetch my KYC details (name, PAN, date of birth, address and email) using my mobile number via Cybrilla and its partners.",
  bank_account:
    "I allow Bharat Wealth to fetch my bank account details using my mobile number via Cybrilla and its partners.",
};

const TYPES = ["customer_data", "bank_account"];

// How the consent was given. The app reports "button_click" (notice shown on the CTA it taps).
// If FP only accepts certain values, map them here or via FP_LOOKUP_CONSENT_MODE.
const CONSENT_MODES = ["checkbox", "button_click"];
const consentModeFor = (m) =>
  process.env.FP_LOOKUP_CONSENT_MODE?.trim() || (CONSENT_MODES.includes(m) ? m : "checkbox");

const resolveIp = (req) => {
  const raw = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "127.0.0.1";
  return raw.startsWith("::ffff:") ? raw.slice(7) : raw === "::1" ? "127.0.0.1" : raw;
};

/** "YYYY-MM-DDTHH:mm:ss" in IST — the format shown in FP's samples */
const istTimestamp = (d = new Date()) =>
  new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 19);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tenDigitPhone = (p) => {
  const digits = String(p ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
};

/** Lookup doc → API shape */
const present = (doc) => {
  if (!doc) return null;
  const mapped =
    doc.status === "successful"
      ? doc.type === "customer_data" ? mapCustomerData(doc.data) : mapBankData(doc.data)
      : null;
  return {
    lookupId: doc._id,
    status: doc.status,
    // successful but nothing usable came back → treat as "no data found"
    found: !!mapped,
    data: mapped,
    message:
      doc.status === "failed"
        ? "We couldn't find your details. Please enter them manually."
        : doc.status === "pending"
        ? "Still fetching your details…"
        : mapped ? null : "No details found for your mobile number.",
    fetchedAt: doc.updatedAt,
  };
};

/** Pull the latest state from FP into the doc (for pending lookups). */
const refresh = async (doc) => {
  if (!doc?.fpLookupId || doc.status !== "pending") return doc;
  try {
    const fp = await fetchFpLookup(doc.type, doc.fpLookupId);
    doc.status = normaliseLookupStatus(fp.status);
    doc.data = fp.data ?? null;
    doc.rawResponse = fp;
    await doc.save();
  } catch (e) {
    console.warn(`⚠️ [LOOKUP] refresh ${doc.type} failed:`, e.message);
  }
  return doc;
};

const latestOf = (uniqueId, type, extra = {}) =>
  FpLookup.findOne({ uniqueId, type, ...extra }).sort({ createdAt: -1 });

/** Runs (or reuses) one lookup. Never throws — failures are recorded on the doc. */
const runLookup = async ({ uniqueId, type, phone, name, consent }) => {
  // 1. Reuse a recent successful lookup — no new FP call
  const since = new Date(Date.now() - REUSE_DAYS * 86400000);
  const reusable = await latestOf(uniqueId, type, { status: "successful", createdAt: { $gte: since } });
  if (reusable) return reusable;

  // 2. A recent pending one → refresh it instead of creating another
  const pending = await latestOf(uniqueId, type, {
    status: "pending",
    createdAt: { $gte: new Date(Date.now() - 10 * 60000) },
  });
  if (pending) return refresh(pending);

  // 3. Daily cap
  const today = await FpLookup.countDocuments({
    uniqueId,
    type,
    createdAt: { $gte: new Date(Date.now() - 86400000) },
  });
  if (today >= MAX_PER_DAY) return latestOf(uniqueId, type);

  // 4. New lookup
  const sourceRefId = crypto.randomUUID();
  const body = {
    source_ref_id: sourceRefId,
    phone_number: phone,
    consent,
    ...(type === "customer_data" ? { name } : {}),
  };
  const doc = await FpLookup.create({
    uniqueId, type, sourceRefId, phoneNumber: phone,
    name: type === "customer_data" ? name : undefined,
    consent, status: "pending",
  });

  try {
    const fp = await createFpLookup(type, body);
    doc.fpLookupId = fp.id;
    doc.status = normaliseLookupStatus(fp.status);
    doc.data = fp.data ?? null;
    doc.rawResponse = fp;
    await doc.save();
  } catch (e) {
    doc.status = "failed";
    doc.error = e.message;
    await doc.save();
    return doc;
  }

  // 5. Short poll while FP resolves it
  for (let i = 0; i < POLL_ATTEMPTS && doc.status === "pending"; i++) {
    await sleep(POLL_DELAY_MS);
    await refresh(doc);
  }
  return doc;
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/lookup                                                 */
/* ------------------------------------------------------------------ */
export const createLookup = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { consent, consentText, consentMode } = req.body ?? {};
    const types = Array.isArray(req.body?.types) && req.body.types.length
      ? req.body.types.filter((t) => TYPES.includes(t))
      : TYPES;

    if (consent !== true) {
      return res.status(400).json({ success: false, message: "Consent is required to fetch your details" });
    }
    if (!types.length) {
      return res.status(400).json({ success: false, message: `types must be any of: ${TYPES.join(", ")}` });
    }

    const [user, mfData] = await Promise.all([
      User.findOne({ uniqueId }),
      MfUserData.findOne({ uniqueId }),
    ]);
    const phone = tenDigitPhone(mfData?.phone?.number || user?.phone);
    if (phone.length !== 10) {
      return res.status(400).json({ success: false, message: "A verified mobile number is required" });
    }
    const name =
      [user?.First_name, user?.Last_name].filter(Boolean).join(" ").trim() ||
      mfData?.investorProfile?.name ||
      "";

    const collectedAt = istTimestamp();
    const ip = resolveIp(req);
    const text = (t) =>
      typeof consentText === "string" && consentText.trim() && consentText.length <= 1000
        ? consentText.trim()
        : LOOKUP_CONSENT_TEXT[t];

    const results = await Promise.all(
      types.map(async (type) => {
        if (type === "customer_data" && !name) {
          return [type, { status: "failed", found: false, data: null, message: "Name not available for lookup." }];
        }
        const doc = await runLookup({
          uniqueId, type, phone, name,
          consent: { collected_at: collectedAt, text: text(type), mode: consentModeFor(consentMode), ip_address: ip },
        });
        return [type, present(doc)];
      })
    );

    const out = Object.fromEntries(results);
    return res.status(200).json({
      success: true,
      customer: out.customer_data ?? null,
      bank: out.bank_account ?? null,
    });
  } catch (err) {
    console.error("❌ [LOOKUP] Create error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to fetch your details" });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/lookup                                                  */
/* ------------------------------------------------------------------ */
export const getLookups = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const [customer, bank] = await Promise.all(
      TYPES.map(async (t) => refresh(await latestOf(uniqueId, t)))
    );
    return res.status(200).json({
      success: true,
      customer: present(customer),
      bank: present(bank),
      consentText: LOOKUP_CONSENT_TEXT,
    });
  } catch (err) {
    console.error("❌ [LOOKUP] Get error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to fetch lookup status" });
  }
};

/**
 * Latest successful lookup values for the account prefill endpoint.
 * DB only (no FP calls). Returns { customer, bank } — either may be null.
 */
export const getLookupPrefill = async (uniqueId) => {
  const [c, b] = await Promise.all([
    latestOf(uniqueId, "customer_data", { status: "successful" }),
    latestOf(uniqueId, "bank_account", { status: "successful" }),
  ]);
  return {
    customer: c ? mapCustomerData(c.data) : null,
    bank: b ? mapBankData(b.data) : null,
  };
};
