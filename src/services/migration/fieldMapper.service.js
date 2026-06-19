import { MIGRATION_ENUM_MAPS } from "../../config/migrationDefaults.config.js";

/* ------------------------------------------------------------------ */
/*  Low-level normalizers                                               */
/* ------------------------------------------------------------------ */

/** Excel DOB column is DD/MM/YYYY text (or a Date if the cell was date-typed). */
export const parseDob = (value) => {
  if (!value) return null;

  if (value instanceof Date) {
    const yyyy = value.getFullYear();
    const mm = String(value.getMonth() + 1).padStart(2, "0");
    const dd = String(value.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  const str = String(value).trim();

  const ddmmyyyy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy] = ddmmyyyy;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  return null;
};

export const cleanPhone = (value) => {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, "");
  const last10 = digits.slice(-10);
  return /^[0-9]{10}$/.test(last10) ? last10 : null;
};

export const cleanPan = (value) => {
  if (!value) return null;
  const pan = String(value).trim().toUpperCase();
  return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan) ? pan : null;
};

export const buildFullName = (first, middle, last) =>
  [first, middle, last]
    .filter(Boolean)
    .map((p) => String(p).trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeEnumKey = (value) =>
  String(value ?? "").trim().toUpperCase().replace(/\s+/g, "_");

export const mapGender = (value) =>
  MIGRATION_ENUM_MAPS.gender[normalizeEnumKey(value)] ?? null;

export const mapTaxStatus = (value) =>
  MIGRATION_ENUM_MAPS.taxStatus[normalizeEnumKey(value)] ?? "resident_individual";

export const mapOccupation = (value) => {
  const key = String(value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  return MIGRATION_ENUM_MAPS.occupation.includes(key) ? key : "others";
};

export const mapAccountType = (value) =>
  MIGRATION_ENUM_MAPS.accountType[normalizeEnumKey(value)] ?? null;

export const mapRelationship = (value) => {
  const key = String(value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  return MIGRATION_ENUM_MAPS.relationship.includes(key) ? key : "others";
};

const isYes = (value) => String(value ?? "").trim().toUpperCase() === "Y";

/** Report uses "DD/MM/YYYY h:mm:ss AM/PM" for Bank{N} Created/Modified At columns. */
const parseDateTime = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;

  const str = String(value).trim();
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;

  let [, dd, mm, yyyy, hh, min, sec, ampm] = m;
  hh = parseInt(hh, 10);
  if (ampm.toUpperCase() === "PM" && hh !== 12) hh += 12;
  if (ampm.toUpperCase() === "AM" && hh === 12) hh = 0;

  return new Date(Number(yyyy), Number(mm) - 1, Number(dd), hh, Number(min), Number(sec));
};

/**
 * The report carries up to 5 bank account slots per investor. Column casing
 * is inconsistent in the source ("Account Type 1/2" vs "Account type 3/4/5").
 */
const BANK_SLOT_COLUMNS = [
  { slot: 1, type: "Account Type 1", accNo: "Account No 1", ifsc: "IFSC Code 1", created: "Bank1 Created At", modified: "Bank1 Last Modified At", status: "Bank1 Status", defaultFlag: "Default Bank Flag 1" },
  { slot: 2, type: "Account Type 2", accNo: "Account No 2", ifsc: "IFSC Code 2", created: "Bank2 Created At", modified: "Bank2 Last Modified At", status: "Bank2 Status", defaultFlag: "Default Bank Flag 2" },
  { slot: 3, type: "Account type 3", accNo: "Account No 3", ifsc: "IFSC Code 3", created: "Bank3 Created At", modified: "Bank3 Last Modified At", status: "Bank3 Status", defaultFlag: "Default Bank Flag 3" },
  { slot: 4, type: "Account type 4", accNo: "Account No 4", ifsc: "IFSC Code 4", created: "Bank4 Created At", modified: "Bank4 Last Modified At", status: "Bank4 Status", defaultFlag: "Default Bank Flag 4" },
  { slot: 5, type: "Account type 5", accNo: "Account No 5", ifsc: "IFSC Code 5", created: "Bank5 Created At", modified: "Bank5 Last Modified At", status: "Bank5 Status", defaultFlag: "Default Bank Flag 5" },
];

/**
 * Picks the bank account to migrate when a row has multiple slots filled.
 * Preference: valid accounts only, most recently modified (fallback: created)
 * wins; ties broken by the higher slot number (later slot = added more recently).
 */
const pickBestBankSlot = (row) => {
  const candidates = [];

  for (const cols of BANK_SLOT_COLUMNS) {
    const accountType = mapAccountType(row[cols.type]);
    const accountNumber = row[cols.accNo];
    const ifscCode = row[cols.ifsc];
    if (!accountNumber || !ifscCode || !accountType) continue;

    const status = row[cols.status] ? String(row[cols.status]).trim().toUpperCase() : null;
    if (status && status !== "VALID") continue; // skip explicitly invalid/closed accounts

    candidates.push({
      slot: cols.slot,
      accountNumber: String(accountNumber).trim(),
      ifscCode: String(ifscCode).trim().toUpperCase(),
      type: accountType,
      modifiedAt: parseDateTime(row[cols.modified]) ?? parseDateTime(row[cols.created]),
    });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const aTime = a.modifiedAt ? a.modifiedAt.getTime() : -Infinity;
    const bTime = b.modifiedAt ? b.modifiedAt.getTime() : -Infinity;
    if (aTime !== bTime) return bTime - aTime; // most recently modified first
    return b.slot - a.slot;                    // tie-break: higher slot wins
  });

  return candidates[0];
};

/* ------------------------------------------------------------------ */
/*  Main mapper — Excel row → normalized migration input                */
/*                                                                      */
/*  Returns { data, manualReviewReason }.                              */
/*  If manualReviewReason is set, the row must NOT be auto-processed — */
/*  it hits a gap the platform doesn't support yet (joint holding,     */
/*  minor without complete guardian data, missing PAN, etc).           */
/* ------------------------------------------------------------------ */
export const mapExcelRowToMigrationInput = (row) => {
  const fullName = buildFullName(
    row["Primary Holder First Name"],
    row["Primary Holder Middle Name"],
    row["Primary Holder Last Name"],
  );

  const phone = cleanPhone(row["Indian Mobile No."]);
  const pan   = cleanPan(row["Primary Holder PAN"]);
  const dob   = parseDob(row["Primary Holder DOB/Incorporation"]);
  const email = row["Email"] ? String(row["Email"]).trim().toLowerCase() : null;

  /* ---------- HARD GAPS — flag for manual review, do not process ---------- */
  if (String(row["Holding Nature"] ?? "").trim().toUpperCase() !== "SINGLE") {
    return { data: null, manualReviewReason: `Holding Nature is "${row["Holding Nature"]}" — only SINGLE holding is supported` };
  }
  if (!phone)  return { data: null, manualReviewReason: "Missing/invalid mobile number (Indian Mobile No.)" };
  if (!pan)    return { data: null, manualReviewReason: "Missing/invalid PAN (Primary Holder PAN)" };
  if (!dob)    return { data: null, manualReviewReason: "Missing/invalid DOB (Primary Holder DOB/Incorporation)" };
  if (!fullName) return { data: null, manualReviewReason: "Missing primary holder name" };

  const gender = mapGender(row["Gender"]);
  if (!gender) return { data: null, manualReviewReason: `Unrecognized Gender value "${row["Gender"]}"` };

  /* ---------- ADDRESS ---------- */
  const addressLine1 = [row["Address 1"], row["Address 2"]].filter(Boolean).join(", ").trim() || null;
  const addressLine2 = row["Address 3"] ? String(row["Address 3"]).trim() : null;
  const pincode = row["Pincode"] ? String(row["Pincode"]).trim() : null;

  /* ---------- BANK (check all 5 slots — pick the most recently modified valid one) ---------- */
  let bank = null;
  const bestBank = pickBestBankSlot(row);
  if (bestBank) {
    bank = {
      accountNumber: bestBank.accountNumber,
      ifscCode:      bestBank.ifscCode,
      type:          bestBank.type,
      holderName:    row["Cheque Name"]?.trim() || fullName,
    };
  }

  /* ---------- NOMINEE (Nominee 1 — only if adult + all required fields present) ---------- */
  let nominee = null;
  let nomineeSkipReason = null;
  const nomineeName = row["Nominee 1 Name"];
  if (nomineeName) {
    if (isYes(row["Nominee 1 Minor Flag"])) {
      nomineeSkipReason = "Nominee 1 is a minor — guardian data from this report is not reliably mappable, skipping nominee";
    } else {
      const nomineePan = row["NOM1_ID_TYP"] === "PAN" ? cleanPan(row["NOM1_IDNO"]) : null;
      const nomineeDob = parseDob(row["Nominee 1 DOB"]);
      const hasAddress = row["NOM1_ADD1"] && row["NOM1_CITY"] && row["NOM1_PIN"];
      // FP rejects related_party creation without date_of_birth — if the
      // report doesn't have it for this nominee, treat as "not usable" and skip.
      if (nomineePan && nomineeDob && row["NOM1_EMAIL"] && row["NOM1_MOB"] && hasAddress) {
        nominee = {
          name:         String(nomineeName).trim(),
          relationship: mapRelationship(row["Nominee 1 Relationship"]),
          pan:          nomineePan,
          dob:          nomineeDob,
          emailAddress: String(row["NOM1_EMAIL"]).trim().toLowerCase(),
          phoneNumber:  cleanPhone(row["NOM1_MOB"]),
          line1:        String(row["NOM1_ADD1"]).trim(),
          line2:        row["NOM1_ADD2"] ? String(row["NOM1_ADD2"]).trim() : null,
          city:         String(row["NOM1_CITY"]).trim(),
          pincode:      String(row["NOM1_PIN"]).trim(),
        };
      } else {
        nomineeSkipReason = "Nominee 1 present but missing required fields (PAN/DOB/email/mobile/address) — skipping nominee";
      }
    }
  }

  return {
    data: {
      // Step 1 — registration
      phone,
      fullName,
      email,

      // Step 2 — PAN verification
      pan,
      dob,

      // Step 3 — MF account setup
      gender,
      occupation: mapOccupation(row["Occupation Code"]),
      taxStatus:  mapTaxStatus(row["Tax Status"]),
      address: addressLine1 && pincode
        ? { line1: addressLine1, line2: addressLine2, postalCode: pincode }
        : null,
      bank,
      nominee,
      nomineeSkipReason,
    },
    manualReviewReason: null,
  };
};
