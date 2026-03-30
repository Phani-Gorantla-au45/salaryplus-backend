import MfUserData from "../../../models/mf/mfUserData.model.js";
import {
  createFpPhoneNumber,
  fetchFpPhoneNumber,
} from "../../../utils/mf/onboarding/phoneNumber.utils.js";
import { sendSmsOtp }                    from "../../../utils/notifications/sms.utils.js";
import { generateOtp, hashOtp, verifyOtp, otpExpiresAt } from "../../../utils/otp.utils.js";

/* ------------------------------------------------------------------ */
/*  POST /api/mf/phone-number                                           */
/* ------------------------------------------------------------------ */
export const createPhoneNumber = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { isd = "91", number, belongs_to } = req.body;

    if (!number) {
      return res.status(400).json({ success: false, message: "number is required" });
    }

    const mfData = await MfUserData.findOne({ uniqueId });

    /* ---------- INVESTOR PROFILE REQUIRED ---------- */
    const fpInvestorProfileId = mfData?.investorProfile?.fpInvestorProfileId;
    if (!fpInvestorProfileId) {
      return res.status(400).json({
        success: false,
        message: "Investor profile not found. Create one first via POST /api/mf/investor-profile",
      });
    }

    /* ---------- PREVENT DUPLICATE ---------- */
    if (mfData?.phone?.fpPhoneNumberId) {
      return res.status(409).json({
        success: false,
        message:         "Phone number already linked to this profile",
        fpPhoneNumberId: mfData.phone.fpPhoneNumberId,
        number:          mfData.phone.number,
      });
    }

    /* ---------- CALL FP API ---------- */
    const payload = {
      profile:    fpInvestorProfileId,
      isd:        String(isd).replace("+", ""),
      number:     String(number),
      ...(belongs_to && { belongs_to }),
    };

    const fpData = await createFpPhoneNumber(payload);

    /* ---------- PERSIST ---------- */
    const record = await MfUserData.findOneAndUpdate(
      { uniqueId },
      {
        $set: {
          phone: {
            fpPhoneNumberId: fpData.id,
            isd:             fpData.isd,
            number:          fpData.number,
            belongsTo:       fpData.belongs_to ?? null,
            rawResponse:     fpData,
          },
        },
      },
      { upsert: true, new: true }
    );

    return res.status(201).json({
      success: true,
      message: "Phone number linked to investor profile",
      data: {
        fpPhoneNumberId:     record.phone.fpPhoneNumberId,
        fpInvestorProfileId: fpInvestorProfileId,
        isd:                 record.phone.isd,
        number:              record.phone.number,
        belongsTo:           record.phone.belongsTo,
      },
    });
  } catch (err) {
    console.error("❌ [PHONE NUMBER] Create error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/phone-number                                            */
/* ------------------------------------------------------------------ */
export const getPhoneNumber = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const mfData = await MfUserData.findOne({ uniqueId });

    if (!mfData?.phone?.fpPhoneNumberId) {
      return res.status(404).json({ success: false, message: "No phone number found" });
    }

    const fpData = await fetchFpPhoneNumber(mfData.phone.fpPhoneNumberId);

    const record = await MfUserData.findOneAndUpdate(
      { uniqueId },
      {
        $set: {
          phone: {
            fpPhoneNumberId: fpData.id,
            isd:             fpData.isd,
            number:          fpData.number,
            belongsTo:       fpData.belongs_to ?? null,
            rawResponse:     fpData,
          },
        },
      },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      data: {
        fpPhoneNumberId:     record.phone.fpPhoneNumberId,
        fpInvestorProfileId: mfData.investorProfile?.fpInvestorProfileId ?? null,
        isd:                 record.phone.isd,
        number:              record.phone.number,
        belongsTo:           record.phone.belongsTo,
      },
    });
  } catch (err) {
    console.error("❌ [PHONE NUMBER] Fetch error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/phone-number/send-otp                                  */
/*  Send OTP to the given mobile number                                  */
/* ------------------------------------------------------------------ */
export const sendPhoneOtp = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { number, isd = "91" } = req.body;

    if (!number) {
      return res.status(400).json({ success: false, message: "number is required" });
    }

    /* ---------- RATE LIMIT — 1 OTP per 60 seconds ---------- */
    const existing = await MfUserData.findOne({ uniqueId })
      .select("phone.otpExpiresAt phone.fpPhoneNumberId");

    if (existing?.phone?.fpPhoneNumberId) {
      return res.status(409).json({
        success: false,
        message: "Phone number already verified and linked",
      });
    }

    if (existing?.phone?.otpExpiresAt) {
      const remainingMs = existing.phone.otpExpiresAt - Date.now() - 9 * 60 * 1000; // within first 60s
      if (remainingMs > 0) {
        return res.status(429).json({
          success: false,
          message: "Please wait 60 seconds before requesting another OTP",
        });
      }
    }

    const otp     = generateOtp();
    const expires = otpExpiresAt();

    /* ---------- SEND SMS ---------- */
    await sendSmsOtp(number, otp);

    /* ---------- STORE HASHED OTP ---------- */
    await MfUserData.findOneAndUpdate(
      { uniqueId },
      {
        $set: {
          "phone.number":      String(number),
          "phone.isd":         String(isd).replace("+", ""),
          "phone.otpCode":     hashOtp(otp),
          "phone.otpExpiresAt": expires,
          "phone.otpVerified": false,
        },
      },
      { upsert: true }
    );

    console.log(`📲 [PHONE OTP] OTP sent to ${isd}${number}`);

    return res.status(200).json({
      success: true,
      message: "OTP sent to your mobile number",
      otpExpiresAt: expires,
    });
  } catch (err) {
    console.error("❌ [PHONE OTP] Send error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to send OTP" });
  }
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/phone-number/verify-otp                                */
/*  Verify OTP — on success, create FP phone number object              */
/* ------------------------------------------------------------------ */
export const verifyPhoneOtp = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { otp, belongs_to } = req.body;

    if (!otp) {
      return res.status(400).json({ success: false, message: "otp is required" });
    }

    /* ---------- LOAD WITH OTP FIELDS ---------- */
    const mfData = await MfUserData.findOne({ uniqueId })
      .select("+phone.otpCode phone.otpExpiresAt phone.number phone.isd phone.fpPhoneNumberId investorProfile.fpInvestorProfileId");

    if (!mfData?.phone?.number) {
      return res.status(400).json({
        success: false,
        message: "No OTP request found. Call /send-otp first",
      });
    }

    if (mfData.phone.fpPhoneNumberId) {
      return res.status(409).json({
        success: false,
        message: "Phone number already verified and linked",
        fpPhoneNumberId: mfData.phone.fpPhoneNumberId,
      });
    }

    /* ---------- EXPIRY CHECK ---------- */
    if (!mfData.phone.otpExpiresAt || mfData.phone.otpExpiresAt < new Date()) {
      return res.status(400).json({ success: false, message: "OTP has expired" });
    }

    /* ---------- OTP CHECK ---------- */
    if (!verifyOtp(otp, mfData.phone.otpCode)) {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    /* ---------- INVESTOR PROFILE REQUIRED ---------- */
    const fpInvestorProfileId = mfData?.investorProfile?.fpInvestorProfileId;
    if (!fpInvestorProfileId) {
      return res.status(400).json({
        success: false,
        message: "Investor profile not found. Create one first via POST /api/mf/investor-profile",
      });
    }

    /* ---------- CREATE FP PHONE OBJECT ---------- */
    const payload = {
      profile: fpInvestorProfileId,
      isd:     mfData.phone.isd,
      number:  mfData.phone.number,
      ...(belongs_to && { belongs_to }),
    };

    const fpData = await createFpPhoneNumber(payload);

    /* ---------- PERSIST ---------- */
    const record = await MfUserData.findOneAndUpdate(
      { uniqueId },
      {
        $set: {
          "phone.fpPhoneNumberId": fpData.id,
          "phone.isd":             fpData.isd,
          "phone.number":          fpData.number,
          "phone.belongsTo":       fpData.belongs_to ?? null,
          "phone.otpVerified":     true,
          "phone.otpCode":         null,
          "phone.rawResponse":     fpData,
        },
      },
      { new: true }
    );

    console.log(`✅ [PHONE OTP] Verified and FP phone object created for user: ${uniqueId}`);

    return res.status(201).json({
      success: true,
      message: "Phone number verified and linked to investor profile",
      data: {
        fpPhoneNumberId:     record.phone.fpPhoneNumberId,
        fpInvestorProfileId: fpInvestorProfileId,
        isd:                 record.phone.isd,
        number:              record.phone.number,
        belongsTo:           record.phone.belongsTo,
      },
    });
  } catch (err) {
    console.error("❌ [PHONE OTP] Verify error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
