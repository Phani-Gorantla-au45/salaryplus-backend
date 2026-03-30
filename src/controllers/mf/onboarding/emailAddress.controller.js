import MfUserData from "../../../models/mf/mfUserData.model.js";
import {
  createFpEmailAddress,
  fetchFpEmailAddress,
} from "../../../utils/mf/onboarding/emailAddress.utils.js";
import { sendEmailOtp as sendEmailOtpNotification } from "../../../utils/notifications/email.utils.js";
import { generateOtp, hashOtp, verifyOtp, otpExpiresAt } from "../../../utils/otp.utils.js";

/* ------------------------------------------------------------------ */
/*  POST /api/mf/email-address                                          */
/* ------------------------------------------------------------------ */
export const createEmailAddress = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { email, belongs_to } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: "email is required" });
    }

    const mfData = await MfUserData.findOne({ uniqueId });

    const fpInvestorProfileId = mfData?.investorProfile?.fpInvestorProfileId;
    if (!fpInvestorProfileId) {
      return res.status(400).json({
        success: false,
        message: "Investor profile not found. Create one first via POST /api/mf/investor-profile",
      });
    }

    if (mfData?.email?.fpEmailAddressId) {
      return res.status(409).json({
        success: false,
        message:          "Email address already linked to this profile",
        fpEmailAddressId: mfData.email.fpEmailAddressId,
        email:            mfData.email.email,
      });
    }

    const payload = {
      profile:   fpInvestorProfileId,
      email:     email.trim().toLowerCase(),
      ...(belongs_to && { belongs_to }),
    };

    const fpData = await createFpEmailAddress(payload);

    const record = await MfUserData.findOneAndUpdate(
      { uniqueId },
      {
        $set: {
          email: {
            fpEmailAddressId: fpData.id,
            email:            fpData.email,
            belongsTo:        fpData.belongs_to ?? null,
            rawResponse:      fpData,
          },
        },
      },
      { upsert: true, new: true }
    );

    return res.status(201).json({
      success: true,
      message: "Email address linked to investor profile",
      data: {
        fpEmailAddressId:    record.email.fpEmailAddressId,
        fpInvestorProfileId: fpInvestorProfileId,
        email:               record.email.email,
        belongsTo:           record.email.belongsTo,
      },
    });
  } catch (err) {
    console.error("❌ [EMAIL ADDRESS] Create error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/email-address                                           */
/* ------------------------------------------------------------------ */
export const getEmailAddress = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const mfData = await MfUserData.findOne({ uniqueId });

    if (!mfData?.email?.fpEmailAddressId) {
      return res.status(404).json({ success: false, message: "No email address found" });
    }

    const fpData = await fetchFpEmailAddress(mfData.email.fpEmailAddressId);

    const record = await MfUserData.findOneAndUpdate(
      { uniqueId },
      {
        $set: {
          email: {
            fpEmailAddressId: fpData.id,
            email:            fpData.email,
            belongsTo:        fpData.belongs_to ?? null,
            rawResponse:      fpData,
          },
        },
      },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      data: {
        fpEmailAddressId:    record.email.fpEmailAddressId,
        fpInvestorProfileId: mfData.investorProfile?.fpInvestorProfileId ?? null,
        email:               record.email.email,
        belongsTo:           record.email.belongsTo,
      },
    });
  } catch (err) {
    console.error("❌ [EMAIL ADDRESS] Fetch error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/email-address/send-otp                                 */
/*  Send OTP to the given email address                                  */
/* ------------------------------------------------------------------ */
export const sendEmailOtpHandler = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: "email is required" });
    }

    const emailLower = email.trim().toLowerCase();

    /* ---------- RATE LIMIT — 1 OTP per 60 seconds ---------- */
    const existing = await MfUserData.findOne({ uniqueId })
      .select("email.otpExpiresAt email.fpEmailAddressId");

    if (existing?.email?.fpEmailAddressId) {
      return res.status(409).json({
        success: false,
        message: "Email address already verified and linked",
      });
    }

    if (existing?.email?.otpExpiresAt) {
      const remainingMs = existing.email.otpExpiresAt - Date.now() - 9 * 60 * 1000;
      if (remainingMs > 0) {
        return res.status(429).json({
          success: false,
          message: "Please wait 60 seconds before requesting another OTP",
        });
      }
    }

    const otp     = generateOtp();
    const expires = otpExpiresAt();

    /* ---------- SEND EMAIL ---------- */
    await sendEmailOtpNotification(emailLower, otp);

    /* ---------- STORE HASHED OTP ---------- */
    await MfUserData.findOneAndUpdate(
      { uniqueId },
      {
        $set: {
          "email.email":        emailLower,
          "email.otpCode":      hashOtp(otp),
          "email.otpExpiresAt": expires,
          "email.otpVerified":  false,
        },
      },
      { upsert: true }
    );

    console.log(`📧 [EMAIL OTP] OTP sent to ${emailLower}`);

    return res.status(200).json({
      success: true,
      message: "OTP sent to your email address",
      otpExpiresAt: expires,
    });
  } catch (err) {
    console.error("❌ [EMAIL OTP] Send error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to send OTP" });
  }
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/email-address/verify-otp                               */
/*  Verify OTP — on success, create FP email address object             */
/* ------------------------------------------------------------------ */
export const verifyEmailOtp = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { otp, belongs_to } = req.body;

    if (!otp) {
      return res.status(400).json({ success: false, message: "otp is required" });
    }

    /* ---------- LOAD WITH OTP FIELDS ---------- */
    const mfData = await MfUserData.findOne({ uniqueId })
      .select("+email.otpCode email.otpExpiresAt email.email email.fpEmailAddressId investorProfile.fpInvestorProfileId");

    if (!mfData?.email?.email) {
      return res.status(400).json({
        success: false,
        message: "No OTP request found. Call /send-otp first",
      });
    }

    if (mfData.email.fpEmailAddressId) {
      return res.status(409).json({
        success: false,
        message: "Email address already verified and linked",
        fpEmailAddressId: mfData.email.fpEmailAddressId,
      });
    }

    /* ---------- EXPIRY CHECK ---------- */
    if (!mfData.email.otpExpiresAt || mfData.email.otpExpiresAt < new Date()) {
      return res.status(400).json({ success: false, message: "OTP has expired" });
    }

    /* ---------- OTP CHECK ---------- */
    if (!verifyOtp(otp, mfData.email.otpCode)) {
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

    /* ---------- CREATE FP EMAIL OBJECT ---------- */
    const payload = {
      profile:  fpInvestorProfileId,
      email:    mfData.email.email,
      ...(belongs_to && { belongs_to }),
    };

    const fpData = await createFpEmailAddress(payload);

    /* ---------- PERSIST ---------- */
    const record = await MfUserData.findOneAndUpdate(
      { uniqueId },
      {
        $set: {
          "email.fpEmailAddressId": fpData.id,
          "email.email":            fpData.email,
          "email.belongsTo":        fpData.belongs_to ?? null,
          "email.otpVerified":      true,
          "email.otpCode":          null,
          "email.rawResponse":      fpData,
        },
      },
      { new: true }
    );

    console.log(`✅ [EMAIL OTP] Verified and FP email object created for user: ${uniqueId}`);

    return res.status(201).json({
      success: true,
      message: "Email address verified and linked to investor profile",
      data: {
        fpEmailAddressId:    record.email.fpEmailAddressId,
        fpInvestorProfileId: fpInvestorProfileId,
        email:               record.email.email,
        belongsTo:           record.email.belongsTo,
      },
    });
  } catch (err) {
    console.error("❌ [EMAIL OTP] Verify error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
