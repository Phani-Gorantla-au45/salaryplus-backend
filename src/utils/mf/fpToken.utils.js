import axios from "axios";
import FpToken from "../../models/mf/fpToken.model.js";

/**
 * Returns a valid FintechPrimitives Bearer token.
 * Auth endpoint: POST /v2/auth/{tenant}/token
 * Caches in DB with a 60-second safety buffer.
 */
export const getFpToken = async () => {
  /* ---------- CHECK CACHE ---------- */
  const cached = await FpToken.findOne().sort({ createdAt: -1 }).lean();

  if (cached && cached.expiresAt > new Date()) {
    console.log("✅ [FP TOKEN] Using cached token");
    return cached.accessToken;
  }

  /* ---------- FETCH NEW TOKEN ---------- */
  console.log("📡 [FP TOKEN] Fetching new token from FintechPrimitives");

  const params = new URLSearchParams();
  params.append("client_id",     process.env.FP_CLIENT_ID);
  params.append("client_secret", process.env.FP_CLIENT_SECRET);
  params.append("grant_type",    "client_credentials");

  let response;
  try {
    response = await axios.post(
      `${process.env.FP_API_URL}/v2/auth/${process.env.FP_TENANT_ID}/token`,
      params,
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
  } catch (err) {
    console.error("❌ [FP TOKEN] Failed to fetch token:", err.response?.data || err.message);
    throw new Error("Failed to fetch FintechPrimitives auth token");
  }

  const { access_token, expires_in } = response.data;

  if (!access_token) {
    throw new Error("FP token response missing access_token");
  }

  const expiresAt = new Date(Date.now() + (expires_in - 60) * 1000);

  await FpToken.deleteMany({});
  await FpToken.create({ accessToken: access_token, expiresAt });

  console.log(`✅ [FP TOKEN] New token fetched, expires in ${expires_in}s`);

  return access_token;
};
