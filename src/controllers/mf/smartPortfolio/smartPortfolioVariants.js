/* ====================================================================
 *  Smart Portfolio variants
 *
 *  standard → config key "default"  (the original Smart Portfolio)
 *  small    → config key "small"    ("Smart Portfolio – Small Investments",
 *                                     its own funds + allocation, aimed at ~₹500/month)
 *
 *  Each variant is a separate SmartPortfolioConfig document with the same
 *  shape (equity/debt/gold funds + formula per risk level), so the allocation
 *  engine, minimum calculation and admin screens are shared.
 *
 *  A user holds ONE Smart Portfolio at a time (UserSmartPortfolio.variant).
 * ==================================================================== */

export const VARIANTS = ["standard", "small"];

const DEFAULTS = {
  standard: {
    key:         "default",
    displayName: "Smart Portfolio",
    tagline:     "A complete portfolio across Equity, Debt & Gold",
    enabled:     true,   // standard is on unless admin explicitly disables it
  },
  small: {
    key:         "small",
    displayName: "Smart Portfolio – Small Investments",
    tagline:     "Start small with fewer, low-minimum funds",
    enabled:     false,  // off until admin enables it
  },
};

export const normalizeVariant = (v) => (v === "small" ? "small" : "standard");

export const configKey = (variant) => DEFAULTS[normalizeVariant(variant)].key;

/** Old user records have no `variant` — they are standard. */
export const variantOf = (portfolio) => normalizeVariant(portfolio?.variant);

/** Public-facing metadata for a variant, with admin overrides from its config doc. */
export const variantMeta = (variant, cfg) => {
  const v = normalizeVariant(variant);
  const d = DEFAULTS[v];
  return {
    variant:       v,
    displayName:   cfg?.displayName || d.displayName,
    tagline:       cfg?.tagline     || d.tagline,
    isEnabled:     cfg?.isEnabled ?? d.enabled,
    displayMinSip: cfg?.displayMinSip ?? null, // "starts from ₹X/month" shown in the app
  };
};

/** A config is usable only if it has at least one fund. */
export const isConfigured = (cfg) =>
  !!cfg && !!(cfg.equity?.length || cfg.debt?.length || cfg.gold?.length);
