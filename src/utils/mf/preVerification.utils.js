import axios from "axios";
import { getCybrillaToken } from "./cybrillaToken.utils.js";

const CYBRILLA_API_URL = () => process.env.CYBRILLA_API_URL;

/**
 * Creates a Pre-Verification request for PAN validation.
 * Validates investor's PAN, name, and date of birth against IT Department records.
 *
 * @param {string} pan           - Investor's PAN number (uppercase)
 * @param {string} name          - Investor's name as on PAN
 * @param {string} date_of_birth - Date of birth in YYYY-MM-DD format
 * @returns {object} - Cybrilla pre-verification object { id, status, pan, name, date_of_birth, ... }
 */
export const createPreVerification = async (pan, name, date_of_birth) => {
  console.log(`🔄 [CYBRILLA PV] Creating pre-verification for PAN: ${pan}`);

  const token = await getCybrillaToken();

  try {
    const response = await axios.post(
      `${CYBRILLA_API_URL()}/poa/pre_verifications`,
      {
        investor_identifier: pan,
        pan: { value: pan },
        name: { value: name },
        date_of_birth: { value: date_of_birth },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(
      `✅ [CYBRILLA PV] Pre-verification created — id: ${response.data?.id}, status: ${response.data?.status}`
    );
    console.log("Kyc response", response.data);
    return response.data;
  } catch (err) {
    console.error(
      "❌ [CYBRILLA PV] Failed to create pre-verification:",
      err.response?.data || err.message
    );
    throw new Error(
      err.response?.data?.message ||
        "Failed to create Cybrilla pre-verification"
    );
  }
};

/**
 * Creates a Pre-Verification request that includes bank account verification.
 * Reuses the same /poa/pre_verifications endpoint with bank_accounts payload.
 *
 * @param {string} pan           - Investor's PAN
 * @param {string} name          - Investor's name
 * @param {string} date_of_birth - YYYY-MM-DD
 * @param {string} accountNumber - Bank account number
 * @param {string} ifscCode      - IFSC code
 * @param {string} accountType   - "savings" | "current"
 * @returns {object} - Cybrilla pre-verification object
 */
export const createBankPreVerification = async (
  pan,
  name,
  date_of_birth,
  accountNumber,
  ifscCode,
  accountType
) => {
  console.log(
    `🔄 [CYBRILLA BANK VERIFY] Creating bank pre-verification for PAN: ${pan}, account: ${accountNumber}`
  );

  const token = await getCybrillaToken();

  try {
    const response = await axios.post(
      `${CYBRILLA_API_URL()}/poa/pre_verifications`,
      {
        investor_identifier: pan,
        pan: { value: pan },
        name: { value: name },
        date_of_birth: { value: date_of_birth },
        bank_accounts: [
          {
            value: {
              account_number: accountNumber,
              ifsc_code: ifscCode,
              account_type: accountType, // savings | current
            },
            // verify_manually_if_required: true,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("pre verification after", response.data);
    console.log(
      `✅ [CYBRILLA BANK VERIFY] Pre-verification created — id: ${response.data?.id}, status: ${response.data?.status}`
    );
    return response.data;
  } catch (err) {
    console.error(
      "❌ [CYBRILLA BANK VERIFY] Failed to create bank pre-verification:",
      err.response?.data || err.message
    );
    throw new Error(
      err.response?.data?.message ||
        "Failed to create bank account pre-verification"
    );
  }
};

/**
 * Fetches the current status/result of a Pre-Verification by its ID.
 *
 * @param {string} pvId - Pre-verification ID (e.g. "pv_8f6ed76d90ef43a2b4854717ac78d747")
 * @returns {object} - Full Cybrilla pre-verification object
 */
export const fetchPreVerification = async (pvId) => {
  const token = await getCybrillaToken();

  try {
    const response = await axios.get(
      `${CYBRILLA_API_URL()}/poa/pre_verifications/${pvId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    console.log("kyc fetch by ID", response.data);
    return response.data;
  } catch (err) {
    console.error(
      `❌ [CYBRILLA PV] Failed to fetch pre-verification ${pvId}:`,
      err.response?.data || err.message
    );
    throw new Error(
      err.response?.data?.message ||
        "Failed to fetch Cybrilla pre-verification status"
    );
  }
};
