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

  /* ---------- BANK (Bank 1 — assume default/first slot) ---------- */
  let bank = null;
  const accountType = mapAccountType(row["Account Type 1"]);
  if (row["Account No 1"] && row["IFSC Code 1"] && accountType) {
    bank = {
      accountNumber:   String(row["Account No 1"]).trim(),
      ifscCode:        String(row["IFSC Code 1"]).trim().toUpperCase(),
      type:            accountType,
      holderName:      row["Cheque Name"]?.trim() || fullName,
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
      const hasAddress = row["NOM1_ADD1"] && row["NOM1_CITY"] && row["NOM1_PIN"];
      if (nomineePan && row["NOM1_EMAIL"] && row["NOM1_MOB"] && hasAddress) {
        nominee = {
          name:         String(nomineeName).trim(),
          relationship: mapRelationship(row["Nominee 1 Relationship"]),
          pan:          nomineePan,
          emailAddress: String(row["NOM1_EMAIL"]).trim().toLowerCase(),
          phoneNumber:  cleanPhone(row["NOM1_MOB"]),
          line1:        String(row["NOM1_ADD1"]).trim(),
          line2:        row["NOM1_ADD2"] ? String(row["NOM1_ADD2"]).trim() : null,
          city:         String(row["NOM1_CITY"]).trim(),
          pincode:      String(row["NOM1_PIN"]).trim(),
        };
      } else {
        nomineeSkipReason = "Nominee 1 present but missing required fields (PAN/email/mobile/address) — skipping nominee";
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
