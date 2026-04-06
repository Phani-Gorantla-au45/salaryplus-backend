import crypto from "crypto";

/**
 * Verifies the FP-Signature header on an incoming webhook request.
 *
 * Header format:  FP-Signature: <id>:<base64_hmac>
 * Example:        ntwhsc_b33b694a02564a36a267d7cde4bfaf60:AlmqZKLKhx5h...
 *
 * FP signs the raw JSON payload using HMAC-SHA256 with your tenant webhook secret.
 *
 * @param {string} fpSignatureHeader  - Full value of the FP-Signature header
 * @param {object} payload            - Parsed JSON body (the delivered event object)
 * @returns {boolean}
 */
export const verifyFpSignature = (fpSignatureHeader, payload) => {
  if (!fpSignatureHeader) return false;

  const secret = process.env.FP_WEBHOOK_SECRET;
  if (!secret) {
    console.error("❌ [FP WEBHOOK] FP_WEBHOOK_SECRET is not set in environment");
    return false;
  }

  // Extract the signature part (everything after the first ":")
  const parts = fpSignatureHeader.split(":");
  if (parts.length < 2) return false;
  // parts[0] is the secret id, parts[1] is the base64 signature
  const headerSignature = parts[1];

  // Generate expected signature
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(JSON.stringify(payload));
  const expectedSignature = hmac.digest("base64");

  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(headerSignature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
};
