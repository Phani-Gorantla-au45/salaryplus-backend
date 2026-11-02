import axios from "axios";

const FINSIRE_URL = "https://dsa.dpiwealth.com/v1/api/dsa/assets_selection";

const getAuthHeader = () => {
  const lenderSecret      = process.env.LAMF_LENDER_SECRET;
  const distributorSecret = process.env.LAMF_DISTRIBUTOR_SECRET;
  if (!lenderSecret || !distributorSecret) throw new Error("LAMF credentials not configured");
  return Buffer.from(`${lenderSecret}:${distributorSecret}`).toString("base64");
};

export const createFinsireUser = async ({ phone, pan, name, email, dob, latitude, longitude }) => {
  try {
    console.log(`\n🏦 [FINSIRE] Creating user phone=${phone} pan=${pan}`);
    const response = await axios.post(
      FINSIRE_URL,
      { user: { phone, pan, name, email, dob, latitude, longitude } },
      {
        headers: {
          Authorization: getAuthHeader(),
          "Content-Type": "application/json",
        },
      }
    );
    console.log(`✅ [FINSIRE] Response:`, JSON.stringify(response.data));
    return response.data;
  } catch (err) {
    console.error("❌ [FINSIRE] Error:", err.response?.data ?? err.message);
    throw new Error(err.response?.data?.message ?? "Finsire API call failed");
  }
};
