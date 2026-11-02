import MfUserData from "../../../models/mf/mfUserData.model.js";
import MfLamf from "../../../models/mf/lamf/mfLamf.model.js";
import { createFinsireUser } from "../../../utils/mf/lamf/finsire.utils.js";

const DEFAULT_LAT = "17.490262";
const DEFAULT_LNG = "78.392840";

/* ====================================================================
 *  GET /api/mf/lamf/status
 *  Check if user is already registered with Finsire.
 * ==================================================================== */
export const getLamfStatus = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const record = await MfLamf.findOne({ uniqueId }).lean();
    if (!record) {
      return res.status(200).json({ success: true, registered: false });
    }
    return res.status(200).json({
      success:    true,
      registered: true,
      finsireId:  record.finsireId,
      link:       record.finsireLink,
    });
  } catch (err) {
    console.error("❌ [LAMF] Status error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ====================================================================
 *  POST /api/mf/lamf/register
 *
 *  Registers the user with Finsire and stores finsire_id.
 *  Backend resolves phone + PAN from DB. If either is missing,
 *  returns 422 with missingFields so frontend can collect from user.
 *
 *  Body (all optional — overrides DB values if provided):
 *    { phone?, pan?, name?, email?, dob? }
 * ==================================================================== */
export const registerLamfUser = async (req, res) => {
  try {
    const { uniqueId } = req.user;

    // Already registered — return stored data
    const existing = await MfLamf.findOne({ uniqueId }).lean();
    if (existing?.finsireId) {
      return res.status(200).json({
        success:           true,
        alreadyRegistered: true,
        finsireId:         existing.finsireId,
        link:              existing.finsireLink,
      });
    }

    // Resolve user data from DB
    const userData = await MfUserData.findOne({ uniqueId }, {
      name:                     1,
      "email.email":            1,
      "phone.number":           1,
      "investorProfile.pan":    1,
      "investorProfile.dob":    1,
    }).lean();

    // Body overrides DB for any missing fields
    const { phone: bodyPhone, pan: bodyPan, name: bodyName, email: bodyEmail, dob: bodyDob } = req.body;

    const phone = userData?.phone?.number        || bodyPhone || null;
    const pan   = userData?.investorProfile?.pan || bodyPan   || null;
    const name  = userData?.name                 || bodyName  || null;
    const email = userData?.email?.email         || bodyEmail || null;
    const dob   = userData?.investorProfile?.dob || bodyDob   || null;

    // Phone and PAN are mandatory for Finsire — surface missing fields to frontend
    const missingFields = [];
    if (!phone) missingFields.push("phone");
    if (!pan)   missingFields.push("pan");

    if (missingFields.length) {
      return res.status(422).json({
        success:       false,
        missingFields,
        message:       `Please provide ${missingFields.join(" and ")} to proceed with loan application`,
      });
    }

    // Call Finsire
    const result = await createFinsireUser({
      phone,
      pan:       pan.toUpperCase(),
      name:      name  ?? "",
      email:     email ?? "",
      dob:       dob   ?? "",
      latitude:  DEFAULT_LAT,
      longitude: DEFAULT_LNG,
    });

    if (!result?.finsire_id) {
      return res.status(502).json({ success: false, message: "Finsire registration failed — no ID returned" });
    }

    // Persist finsire_id
    await MfLamf.findOneAndUpdate(
      { uniqueId },
      {
        $set: {
          uniqueId,
          finsireId:   result.finsire_id,
          finsireLink: result.link ?? null,
          phone,
          pan:         pan.toUpperCase(),
        },
      },
      { upsert: true }
    );

    console.log(`✅ [LAMF] Registered uniqueId=${uniqueId} finsireId=${result.finsire_id}`);

    return res.status(201).json({
      success:   true,
      finsireId: result.finsire_id,
      link:      result.link ?? null,
    });
  } catch (err) {
    console.error("❌ [LAMF] Register error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
