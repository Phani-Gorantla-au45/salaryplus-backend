import { listFpInvestorProfiles, fetchFpInvestorProfile } from "../../../utils/mf/onboarding/investorProfile.utils.js";
import MfUserData from "../../../models/mf/mfUserData.model.js";

/* ------------------------------------------------------------------ */
/*  GET /api/mf/admin/investor-profiles                                 */
/*  Query: ?uniqueId=xxx  OR  pass nothing to get all                  */
/* ------------------------------------------------------------------ */
export const listInvestorProfiles = async (req, res) => {
  try {
    const { uniqueId } = req.query;
    const params = {};

    if (uniqueId) {
      const mfData = await MfUserData.findOne({ uniqueId }).select("investorProfile").lean();
      const profileId = mfData?.investorProfile?.fpInvestorProfileId;
      if (!profileId) {
        return res.status(404).json({ success: false, message: `No investor profile found for uniqueId: ${uniqueId}` });
      }
      // Fetch single by id
      const data = await fetchFpInvestorProfile(profileId);
      return res.json({ success: true, data });
    }

    const data = await listFpInvestorProfiles({ type: "individual", ...params });
    return res.json({ success: true, data });
  } catch (err) {
    console.error("❌ [ADMIN INVESTOR PROFILE] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
