import crypto from "crypto";

/**
 * SafeGold Encryption — AES/CBC/PKCS7Padding
 *
 * Key  : MD5 hex string of the access token  (32 ASCII bytes → AES-256)
 * IV   : Random 16 bytes generated per request
 * Wire : Base64(IV + AES_encrypted_bytes)   wrapped in { "data": "..." }
 */

const getKey = () => {
  const token = process.env.SAFEGOLD_ACCESS_TOKEN;
  if (!token) throw new Error("SAFEGOLD_ACCESS_TOKEN is not set in environment");
  // MD5 hex string is 32 chars = 32 bytes when used as UTF-8 key → AES-256
  return crypto.createHash("md5").update(token).digest("hex");
};

/**
 * Encrypt a JS object → { data: "<base64 cipher text>" }
 * Cipher text = Base64( IV(16 bytes) + AES_CBC_encrypted_bytes )
 */
export const encryptPayload = (payload) => {
  const key = getKey();
  const iv  = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    Buffer.from(key, "utf8"), // 32-byte key
    iv
  );

  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);

  // Prepend IV so SafeGold can extract it on their side
  const cipherText = Buffer.concat([iv, encrypted]).toString("base64");
  return { data: cipherText };
};

/**
 * Decrypt a SafeGold response { data: "<base64 cipher text>" } → JS object
 * Assumes the first 16 bytes of the decoded buffer are the IV.
 */
export const decryptResponse = (responseData) => {
  if (!responseData) throw new Error("Empty response from SafeGold");

  const key     = getKey();
  const decoded = Buffer.from(responseData, "base64");
  const iv      = decoded.slice(0, 16);
  const encrypted = decoded.slice(16);

  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    Buffer.from(key, "utf8"),
    iv
  );

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8");

  return JSON.parse(decrypted);
};
