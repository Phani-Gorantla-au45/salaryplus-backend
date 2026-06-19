/**
 * Defaults used when migrating users from the BSE "Client Master Report"
 * Excel format — these fields are mandatory for FP's investor profile but
 * do not exist anywhere in that report, so a fixed default is applied to
 * every migrated row. Confirmed with business on 2026-06-18.
 */
export const MIGRATION_DEFAULTS = {
  sourceOfWealth: "salary",
  incomeSlab:     "above_5lakh_upto_10lakh",
  pepDetails:     "not_applicable",
};

export const MIGRATION_ENUM_MAPS = {
  gender: {
    MALE:        "male",
    FEMALE:      "female",
    TRANSGENDER: "transgender",
  },

  // Excel "Tax Status" rarely has anything but INDIVIDUAL; explicit NRI
  // marker (if ever present) maps to FP's nri tax status.
  taxStatus: {
    INDIVIDUAL: "resident_individual",
    NRI:        "nri",
  },

  occupation: [
    "business", "professional", "retired", "house_wife", "student",
    "public_sector_service", "private_sector_service", "government_service",
    "agriculture", "doctor", "forex_dealer", "service", "others",
  ],

  accountType: {
    SAVINGS: "savings",
    CURRENT: "current",
  },
};
