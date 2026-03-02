import axios from "axios";
import CybrillaToken from "../../models/mf/cybrillaToken.model.js";

/**
 * Returns a valid Cybrilla Bearer token.
 * Checks DB cache first — fetches a new token only when expired or absent.
 * Token expiry has a 60-second safety buffer to avoid edge-case expirations.
 */
export const getCybrillaToken = async () => {
  /* ---------- CHECK CACHE ---------- */
  const cached = await CybrillaToken.findOne().sort({ createdAt: -1 }).lean();

  if (cached && cached.expiresAt > new Date()) {
    console.log("✅ [CYBRILLA TOKEN] Using cached token");
    return cached.accessToken;
  }

  /* ---------- FETCH NEW TOKEN ---------- */
  console.log("📡 [CYBRILLA TOKEN] Fetching new token from Cybrilla");

  const params = new URLSearchParams();
  params.append("client_id", process.env.CYBRILLA_CLIENT_ID);
  params.append("client_secret", process.env.CYBRILLA_CLIENT_SECRET);
  params.append("grant_type", "client_credentials");

  let response;
  try {
    response = await axios.post(
      `${process.env.CYBRILLA_AUTH_URL}/v2/auth/cybrillarta/token`,
      params,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );
  } catch (err) {
    console.error(
      "❌ [CYBRILLA TOKEN] Failed to fetch token:",
      err.response?.data || err.message,
    );
    throw new Error("Failed to fetch Cybrilla auth token");
  }

  const { access_token, expires_in } = response.data;

  if (!access_token) {
    console.error("❌ [CYBRILLA TOKEN] No access_token in response", response.data);
    throw new Error("Cybrilla token response missing access_token");
  }

  /* ---------- PERSIST TOKEN ---------- */
  // 60-second safety buffer so we never use a token right at its expiry edge
  const expiresAt = new Date(Date.now() + (expires_in - 60) * 1000);

  await CybrillaToken.deleteMany({});
  await CybrillaToken.create({ accessToken: access_token, expiresAt });

  console.log(`✅ [CYBRILLA TOKEN] New token fetched, expires in ${expires_in}s`);

  return access_token;
};
