import axios from "axios";

/**
 * Single place that builds every OTP SMS sent via Fast2SMS.
 *
 * Approved DLT template — Fast2SMS message id 232000, sender SPENDI,
 * entity SPENDIQ FINTECH PRIVATE LIMITED (1701174114721758554), Service Implicit:
 *   {#var#} is your OTP to log into Bharat Wealth. Valid for 5 mins. Do not share it with anyone.
 *   -Spendiq Fintech Pvt Ltd
 *   {#var#}
 * Variables: OTP | Android app hash. Used for every OTP (login, orders, verification).
 * The trailing app hash lets Android auto-read the OTP (SMS Retriever API).
 *
 * .env
 *   FAST2SMS_LOGIN_TEMPLATE_ID  231993
 *   FAST2SMS_TXN_TEMPLATE_ID    optional separate order/verification template;
 *                               falls back to the login one when empty
 *   SMS_APP_HASH                11-char app hash for the build users install:
 *                                 Play Store      mtDx7gg7Ez4  (production)
 *                                 local APK       JWzNt7veuPJ  (upload key)
 *                                 debug build     YwzgBwtl7Ao
 *   FAST2SMS_SENDER_ID          optional, default "SPENDI"
 *
 * Until a new template id is configured, the legacy template (181034,
 * "Your OTP is X") is used, so behaviour is unchanged.
 */

const LEGACY_TEMPLATE_ID = "181034";

/**
 * @param {string|number} phone 10-digit mobile number
 * @param {string} otp
 * @param {"login"|"txn"} purpose login OTPs vs order / verification OTPs
 */
export const buildOtpSmsPayload = (phone, otp, purpose = "txn") => {
  const loginId = process.env.FAST2SMS_LOGIN_TEMPLATE_ID?.trim();
  const txnId   = process.env.FAST2SMS_TXN_TEMPLATE_ID?.trim();
  const hash    = process.env.SMS_APP_HASH?.trim();
  const templateId = purpose === "login" ? (loginId || txnId) : (txnId || loginId);

  const useNew = !!(templateId && hash);
  return {
    route:            "dlt",
    sender_id:        process.env.FAST2SMS_SENDER_ID?.trim() || "SPENDI",
    message:          useNew ? templateId : LEGACY_TEMPLATE_ID,
    variables_values: useNew ? `${otp}|${hash}` : `Your OTP is ${otp}`,
    numbers:          String(phone),
  };
};

/** Sends the OTP SMS; resolves with Fast2SMS's response, throws on failure. */
export const sendOtpSms = (phone, otp, purpose = "txn") =>
  axios.post(
    process.env.FAST2SMS_API_URL,
    buildOtpSmsPayload(phone, otp, purpose),
    { headers: { authorization: process.env.FAST2SMS_API_KEY } }
  );
