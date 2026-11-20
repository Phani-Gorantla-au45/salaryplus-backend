import axios from "axios";
import { getFpToken } from "../fpToken.utils.js";

/**
 * FP Lookup APIs — fetch an investor's demographic / bank details from
 * third-party sources (with the investor's consent) to pre-fill onboarding.
 *
 *   POST /v2/customer_data_lookups      GET /v2/customer_data_lookups/:id
 *   POST /v2/bank_account_lookups       GET /v2/bank_account_lookups/:id
 */

const FP_API_URL = () => process.env.FP_API_URL;
const FP_TENANT_ID = () => process.env.FP_TENANT_ID;

const fpHeaders = async () => ({
  Authorization: `Bearer ${await getFpToken()}`,
  "Content-Type": "application/json",
  "x-tenant-id": FP_TENANT_ID(),
});

const PATHS = {
  customer_data: "/v2/customer_data_lookups",
  bank_account: "/v2/bank_account_lookups",
};

const fpError = (err, fallback) =>
  new Error(err.response?.data?.message || err.response?.data?.error?.message || fallback);

/** POST — create a lookup. `body` = { source_ref_id, phone_number, consent, name? } */
export const createFpLookup = async (type, body) => {
  try {
    const { data } = await axios.post(`${FP_API_URL()}${PATHS[type]}`, body, {
      headers: await fpHeaders(),
      timeout: 20000,
    });
    console.log(`✅ [FP LOOKUP] ${type} created — id=${data?.id} status=${data?.status}`);
    return data;
  } catch (err) {
    console.error(`❌ [FP LOOKUP] ${type} create failed:`, JSON.stringify(err.response?.data || err.message));
    throw fpError(err, "Lookup request failed");
  }
};

/** GET — fetch a lookup by id */
export const fetchFpLookup = async (type, id) => {
  try {
    const { data } = await axios.get(`${FP_API_URL()}${PATHS[type]}/${id}`, {
      headers: await fpHeaders(),
      timeout: 15000,
    });
    return data;
  } catch (err) {
    console.error(`❌ [FP LOOKUP] ${type} fetch failed:`, JSON.stringify(err.response?.data || err.message));
    throw fpError(err, "Failed to fetch lookup");
  }
};

/** FP docs list pending/successful/failed but samples show "success" — normalise. */
export const normaliseLookupStatus = (s) => {
  const v = String(s || "").toLowerCase();
  if (v === "success" || v === "successful" || v === "completed") return "successful";
  if (v === "failed" || v === "failure" || v === "error") return "failed";
  return "pending";
};

/* ------------------------------------------------------------------ */
/*  Mapping FP lookup data → our form values                            */
/* ------------------------------------------------------------------ */

// Lookup occupation (investor-profile enum) → KYC request occupation_type enum
const KYC_OCCUPATION = {
  private_sector_service: "private_sector",
  public_sector_service: "public_sector",
  government_service: "government_sector",
  house_wife: "housewife",
  business: "business",
  professional: "professional",
  doctor: "professional",
  retired: "retired",
  student: "student",
  others: "others",
};

const latest = (arr) =>
  Array.isArray(arr) && arr.length
    ? [...arr].sort((a, b) => String(b?.reported_date ?? "").localeCompare(String(a?.reported_date ?? "")))[0]
    : null;

const isIsoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ""));
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

const titleCase = (s) =>
  String(s ?? "").toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).trim() || null;

/** customer_data_lookup.data → prefill values (null where unknown/invalid) */
export const mapCustomerData = (d) => {
  if (!d) return null;
  const pan = String(d.pan ?? "").toUpperCase().trim();
  const email = latest(d.email_addresses)?.email?.trim().toLowerCase() || null;
  const addr = latest(d.addresses);
  const pincode = String(addr?.pincode ?? "").trim();
  const aadhaar = String(d.aadhaar_number ?? "").replace(/\D/g, "");
  return {
    name: d.name ? String(d.name).trim() : null,
    pan: PAN_RE.test(pan) ? pan : null,
    dob: isIsoDate(d.date_of_birth) ? d.date_of_birth : null, // YYYY-MM-DD
    gender: ["male", "female", "transgender"].includes(d.gender) ? d.gender : null,
    occupation: d.occupation ?? null,                          // investor-profile enum
    kycOccupation: KYC_OCCUPATION[d.occupation] ?? null,       // KYC request enum
    incomeSlab: d.income_slab ?? null,
    aadhaarLast4: aadhaar.length === 4 ? aadhaar : null,
    email,
    address: addr?.line && /^\d{6}$/.test(pincode)
      ? { line: String(addr.line).trim(), state: titleCase(addr.state), pincode }
      : null,
  };
};

/** bank_account_lookup.data → prefill values */
export const mapBankData = (d) => {
  if (!d) return null;
  const ifsc = String(d.ifsc_code ?? "").toUpperCase().trim();
  const accountNumber = String(d.account_number ?? "").replace(/\s/g, "");
  if (!accountNumber || !IFSC_RE.test(ifsc)) return null;
  return {
    accountNumber,
    ifsc,
    holderName: d.account_holder_name ? String(d.account_holder_name).trim() : null,
    type: ["savings", "current", "nre", "nro"].includes(d.type) ? d.type : null,
  };
};
