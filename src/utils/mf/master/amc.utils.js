import axios from "axios";
import { getFpToken } from "../fpToken.utils.js";
import MfAmc from "../../../models/mf/master/mfAmc.model.js";

const FP_API_URL = () => process.env.FP_API_URL;
const FP_TENANT_ID = () => process.env.FP_TENANT_ID;

const fpHeaders = async () => {
  const token = await getFpToken();
  return {
    Authorization: `Bearer ${token}`,
    "x-tenant-id": FP_TENANT_ID(),
  };
};

/**
 * Brand key for an AMC / fund-house name, so different spellings line up:
 *   "AXIS MUTUAL FUND"                       → "AXIS"
 *   "AXIS ASSET MANAGEMENT COMPANY LIMITED"  → "AXIS"
 *   "HDFC AMC LTD."                          → "HDFC"
 *   "ICICIPRUDENTIALMUTUALFUND_MF_SIF"       → "ICICIPRUDENTIAL"
 */
const SUFFIX_WORDS = /\b(MUTUAL ?FUNDS?|ASSET MANAGEMENT|INVESTMENT MANAGERS?|INVESTMENT MANAGEMENT|FUND MANAGEMENT|MANAGEMENT|AMC|COMPANY|CO|LIMITED|LTD|PRIVATE|PVT|INDIA|SERVICES)\b/g;
export const amcBrandKey = (name) =>
  String(name ?? "")
    .toUpperCase()
    .replace(/_(MF|SIF)\b/g, " ")
    .replace(/MUTUALFUNDS?|MUTUAL FUNDS?/g, " ")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(SUFFIX_WORDS, " ")
    .replace(/\s+/g, "");

/**
 * Returns a map of { fundName (uppercase) → amcLogo } for the given fund-house
 * names. Matches on the brand key (see amcBrandKey); exact brand match wins,
 * otherwise the longest brand that one name starts with (e.g. "ADITYABIRLASUNLIFE"
 * ↔ "BIRLASUNLIFE" via contains). Single DB query, never throws for a missing logo.
 * Keys are stored both as-is uppercased and trimmed, so callers can look up either.
 */
export const getAmcLogoMap = async (fundNames = []) => {
  if (!fundNames.length) return {};
  const amcs = await MfAmc.find(
    { $or: [{ amcLogo: { $ne: null } }, { amclogo: { $ne: null } }] },
    { name: 1, amcLogo: 1, amclogo: 1 }
  ).lean();

  const withKeys = amcs
    .map((amc) => ({ key: amcBrandKey(amc.name), logo: amc.amcLogo ?? amc.amclogo }))
    .filter((a) => a.key && a.logo)
    .sort((x, y) => y.key.length - x.key.length);   // longest (most specific) first

  const result = {};
  for (const fundName of fundNames) {
    if (!fundName) continue;
    const key = amcBrandKey(fundName);
    if (!key) continue;
    const matched =
      withKeys.find((a) => a.key === key) ??
      withKeys.find((a) => key.startsWith(a.key) || a.key.startsWith(key)) ??
      withKeys.find((a) => Math.min(a.key.length, key.length) >= 5 && (key.includes(a.key) || a.key.includes(key)));
    if (matched) {
      result[fundName.toUpperCase()] = matched.logo;
      result[fundName.toUpperCase().trim()] = matched.logo;
    }
  }
  return result;
};

/* GET /api/oms/amcs — returns full list of AMCs */
export const fetchAllFpAmcs = async () => {
  console.log("inside fetchallFp");
  try {
    const response = await axios.get(`${FP_API_URL()}/api/oms/amcs`, {
      headers: await fpHeaders(),
    });
    console.log("Amc data", response.data);
    // Response shape: { amcs: [ { amc_id, name, active, amc_code } ] }
    return response.data?.amcs ?? [];
  } catch (err) {
    console.error(
      "❌ [FP AMC] Fetch failed:",
      err.response?.data || err.message
    );
    throw new Error(
      err.response?.data?.message || "Failed to fetch AMCs from FP"
    );
  }
};
