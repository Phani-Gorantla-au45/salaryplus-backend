/* ------------------------------------------------------------------ */
/*  KYC Request — Allowed values per FintechPrimitives API spec         */
/* ------------------------------------------------------------------ */

export const KYC_ENUMS = {
  gender: ["male", "female", "transgender"],

  marital_status: ["married", "unmarried", "others"],

  residential_status: ["resident_individual"],

  occupation_type: [
    "business",
    "professional",
    "retired",
    "housewife",
    "student",
    "public_sector",
    "private_sector",
    "government_sector",
    "others",
  ],

  income_slab: [
    "upto_1lakh",
    "above_1lakh_upto_5lakh",
    "above_5lakh_upto_10lakh",
    "above_10lakh_upto_25lakh",
    "above_25lakh_upto_1cr",
    "above_1cr",
  ],

  pep_details: ["pep_exposed", "pep_related", "not_applicable"],

  // address.proof_type
  address_proof_type: ["passport", "voter_id", "driving_licence", "aadhaar"],
};

/* ------------------------------------------------------------------ */
/*  validateKycFields                                                    */
/*  Validates any enum fields present in the payload.                   */
/*  Returns { valid: true } or { valid: false, errors: [...] }          */
/* ------------------------------------------------------------------ */
export const validateKycFields = (body) => {
  const errors = [];

  const check = (field, value) => {
    const allowed = KYC_ENUMS[field];
    if (value !== undefined && value !== null && !allowed.includes(value)) {
      errors.push(
        `Invalid value '${value}' for '${field}'. Allowed: ${allowed.join(", ")}`
      );
    }
  };

  check("gender",             body.gender);
  check("marital_status",     body.marital_status);
  check("residential_status", body.residential_status);
  check("occupation_type",    body.occupation_type);
  check("income_slab",        body.income_slab);
  check("pep_details",        body.pep_details);

  // Nested: address.proof_type
  if (body.address?.proof_type !== undefined) {
    check("address_proof_type", body.address.proof_type);
  }

  // citizenship_countries must be an array
  if (body.citizenship_countries !== undefined) {
    if (!Array.isArray(body.citizenship_countries)) {
      errors.push("'citizenship_countries' must be an array e.g. [\"in\"]");
    } else if (body.citizenship_countries.length === 0) {
      errors.push("'citizenship_countries' must have at least one entry");
    }
  }

  // tax_residency_other_than_india must be boolean
  if (
    body.tax_residency_other_than_india !== undefined &&
    typeof body.tax_residency_other_than_india !== "boolean"
  ) {
    errors.push("'tax_residency_other_than_india' must be true or false (boolean)");
  }

  return errors.length === 0
    ? { valid: true }
    : { valid: false, errors };
};
