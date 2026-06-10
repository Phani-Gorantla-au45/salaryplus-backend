import RegistrationUser from "../../models/user/user.model.js";
import SafegoldUser     from "../../models/safegold/safegoldUser.model.js";
import { safegoldPost } from "../../utils/safegold/client.utils.js";

/* ------------------------------------------------------------------ */
/*  POST /api/safegold/user/register                                    */
/*  Registers the authenticated user with SafeGold.                    */
/*  Idempotent — returns existing record if already registered.        */
/*                                                                      */
/*  Body: { pin_code }   (required — not stored in our user DB)        */
/* ------------------------------------------------------------------ */
export const registerSafegoldUser = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { pin_code } = req.body;

    if (!pin_code) {
      return res.status(400).json({
        success: false,
        message: "pin_code is required (6-digit pincode)",
      });
    }
    if (!/^\d{6}$/.test(String(pin_code))) {
      return res.status(400).json({
        success: false,
        message: "pin_code must be a 6-digit number",
      });
    }

    /* ---------- Already registered? ---------- */
    const existing = await SafegoldUser.findOne({ uniqueId });
    if (existing?.isRegistered) {
      return res.status(200).json({
        success: true,
        message: "Already registered with SafeGold",
        data:    safegoldPublicResponse(existing),
      });
    }

    /* ---------- Pull user details from RegistrationUser ---------- */
    const regUser = await RegistrationUser.findOne({ uniqueId });
    if (!regUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const name = [regUser.First_name, regUser.Last_name]
      .filter(Boolean)
      .join(" ")
      .trim();

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "User name is not set. Please complete registration first.",
      });
    }
    if (!regUser.phone) {
      return res.status(400).json({
        success: false,
        message: "Phone number not found on user account.",
      });
    }

    /* ---------- Call SafeGold Registration API ---------- */
    console.log(`\n🥇 [SAFEGOLD REGISTER] user=${uniqueId} name=${name}`);

    const sgPayload = {
      name,
      mobile_no: regUser.phone,
      pin_code:  String(pin_code),
      ...(regUser.email && { email: regUser.email }),
    };

    const sgResponse = await safegoldPost("/v1/users", sgPayload);
    console.log(`  ✅ SafeGold userId=${sgResponse.id}`);

    /* ---------- Save to DB ---------- */
    const record = await SafegoldUser.findOneAndUpdate(
      { uniqueId },
      {
        $set: {
          uniqueId,
          safegoldUserId:    sgResponse.id,
          name:              sgResponse.name              ?? name,
          mobileNo:          sgResponse.mobile_no         ?? regUser.phone,
          email:             sgResponse.email             ?? regUser.email ?? null,
          pinCode:           String(pin_code),
          goldBalance:       sgResponse.gold_balance      ?? 0,
          kyc: {
            identityRequired: sgResponse.kyc_requirement?.identity_required ?? false,
            panRequired:      sgResponse.kyc_requirement?.pan_required      ?? false,
          },
          isRegistered: true,
        },
      },
      { upsert: true, new: true }
    );

    return res.status(201).json({
      success: true,
      message: "Successfully registered with SafeGold",
      data:    safegoldPublicResponse(record),
    });
  } catch (err) {
    console.error("❌ [SAFEGOLD REGISTER] Error:", err.message);
    const errMsg = err.response?.data?.message ?? err.message;
    return res.status(500).json({ success: false, message: errMsg });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/safegold/user/profile                                      */
/*  Returns the user's SafeGold registration status.                   */
/* ------------------------------------------------------------------ */
export const getSafegoldProfile = async (req, res) => {
  try {
    const { uniqueId } = req.user;

    const record = await SafegoldUser.findOne({ uniqueId });
    if (!record?.isRegistered) {
      return res.status(200).json({
        success:      true,
        isRegistered: false,
        data:         null,
      });
    }

    return res.status(200).json({
      success:      true,
      isRegistered: true,
      data:         safegoldPublicResponse(record),
    });
  } catch (err) {
    console.error("❌ [SAFEGOLD PROFILE] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  Internal — public response shape                                    */
/* ------------------------------------------------------------------ */
const safegoldPublicResponse = (r) => ({
  safegoldUserId:    r.safegoldUserId,
  name:              r.name,
  mobileNo:          r.mobileNo,
  email:             r.email,
  goldBalance:       r.goldBalance,
  kyc: {
    identityRequired: r.kyc?.identityRequired ?? false,
    panRequired:      r.kyc?.panRequired      ?? false,
  },
  isRegistered: r.isRegistered,
  createdAt:    r.createdAt,
});
