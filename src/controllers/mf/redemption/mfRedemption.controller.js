import MfRedemption from "../../../models/mf/redemption/mfRedemption.model.js";
import MfUserData from "../../../models/mf/mfUserData.model.js";
import User from "../../../models/user/user.model.js";
import {
  createFpRedemption,
  patchFpRedemption,
  fetchFpRedemption,
  fetchFpRedemptionSummary,
} from "../../../utils/mf/redemption/redemption.utils.js";
import {
  generateOtp,
  otpExpiresAt,
  sendConsentOtp,
  verifyConsentOtp,
} from "../../../utils/mf/consent.utils.js";

/* ------------------------------------------------------------------ */
/*  POST /api/mf/redemption                                             */
/*  Step 1: Create redemption order on FP + send consent OTP.          */
/*                                                                      */
/*  Body: { folio_number, isin, amount, user_ip }                      */
/*  (units is optional — pass either amount or units, not both)        */
/* ------------------------------------------------------------------ */
export const createRedemption = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { folio_number, isin, amount, units, user_ip, redemption_mode } = req.body;

    /* ---------- VALIDATE ---------- */
    if (!folio_number) {
      return res.status(400).json({ success: false, message: "folio_number is required" });
    }
    if (!isin) {
      return res.status(400).json({ success: false, message: "isin is required" });
    }
    if (!amount && !units) {
      return res.status(400).json({
        success: false,
        message: "Either amount or units is required",
      });
    }
    if (amount && units) {
      return res.status(400).json({
        success: false,
        message: "Provide either amount or units, not both",
      });
    }

    /* ---------- STEP 1: GET INVESTMENT ACCOUNT ---------- */
    console.log(`\n🔴 [CREATE REDEMPTION] user=${uniqueId} isin=${isin} folio=${folio_number}`);
    const mfData = await MfUserData.findOne({ uniqueId });
    const fpInvestmentAccountId = mfData?.investmentAccount?.fpInvestmentAccountId;

    if (!fpInvestmentAccountId) {
      return res.status(400).json({
        success: false,
        message: "MF investment account not found. Complete account setup first.",
      });
    }
    console.log(`  [1/4] ✅ investmentAccount=${fpInvestmentAccountId}`);

    /* ---------- STEP 2: CREATE REDEMPTION ON FP ---------- */
    const rawIp =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      "127.0.0.1";
    const resolvedIp = rawIp.startsWith("::ffff:")
      ? rawIp.slice(7)
      : rawIp === "::1"
      ? "127.0.0.1"
      : rawIp;

    const fpPayload = {
      mf_investment_account: fpInvestmentAccountId,
      folio_number:          String(folio_number),
      scheme:                isin.toUpperCase().trim(),
      user_ip:               user_ip || resolvedIp,
    };
    if (amount)                       fpPayload.amount           = Number(amount);
    if (units)                        fpPayload.units            = Number(units);
    if (redemption_mode === "instant") {
      fpPayload.redemption_mode = "instant";
      fpPayload.gateway         = "rta";
    }

    if (fpPayload.redemption_mode === "instant") {
      console.log(`  [2/4] ⚡ INSTANT REDEMPTION — FP payload:`, JSON.stringify(fpPayload, null, 2));
    }
    console.log(`  [2/4] Creating redemption on FP...`);
    const fpData = await createFpRedemption(fpPayload);
    console.log(`  [2/4] ✅ fpRedemptionId=${fpData.id} state=${fpData.state}`);

    /* ---------- STEP 3: SEND CONSENT OTP ---------- */
    let phone = mfData?.phone?.number;
    let email = mfData?.email?.email;
    if (!phone || !email) {
      const user = await User.findOne({ uniqueId });
      if (!phone) phone = user?.phone;
      if (!email) email = user?.email;
    }
    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "No phone number found. Cannot send consent OTP.",
      });
    }
    const otp = generateOtp();
    const expiry = otpExpiresAt();
    console.log(`  [3/4] Sending OTP to ${phone.slice(0, 3)}****${phone.slice(-3)}...`);
    await sendConsentOtp(phone, otp, email);
    console.log(`  [3/4] ✅ OTP sent`);

    /* ---------- STEP 4: SAVE TO DB ---------- */
    console.log(`  [4/4] Saving to DB...`);
    const record = await MfRedemption.findOneAndUpdate(
      { fpRedemptionId: fpData.id },
      {
        $set: {
          uniqueId,
          fpRedemptionId:        fpData.id,
          fpOldId:               fpData.old_id ?? null,
          mfInvestmentAccountId: fpInvestmentAccountId,
          folioNumber:           fpData.folio_number ?? folio_number,
          isin:                  fpData.scheme ?? isin.toUpperCase().trim(),
          amount:                amount ? Number(amount) : null,
          units:                 units  ? Number(units)  : null,
          redemptionMode:        redemption_mode === "instant" ? "instant" : "normal",
          gateway:               redemption_mode === "instant" ? "rta" : null,
          fpState:               fpData.state ?? (redemption_mode === "instant" ? "pending" : "under_review"),
          otpCode:               otp,
          otpExpiresAt:          expiry,
          otpVerified:           false,
          consentGiven:          false,
          rawResponse:           fpData,
        },
      },
      { upsert: true, new: true }
    );
    console.log(`  [4/4] ✅ redemptionId=${record._id}`);

    return res.status(201).json({
      success: true,
      message: "Redemption order created. OTP sent for consent.",
      data: {
        redemptionId:   record._id,
        fpRedemptionId: record.fpRedemptionId,
        folioNumber:    record.folioNumber,
        isin:           record.isin,
        amount:         record.amount,
        units:          record.units,
        redemptionMode: record.redemptionMode,
        gateway:        record.gateway,
        fpState:        record.fpState,
        otpSentTo:      `${phone.slice(0, 3)}****${phone.slice(-3)}`,
        otpExpiresAt:   expiry,
      },
    });
  } catch (err) {
    console.error("❌ [CREATE REDEMPTION] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/redemption/:id/confirm                                 */
/*  Step 2: Verify OTP → PATCH consent + state=confirmed on FP.        */
/*                                                                      */
/*  Body: { otp }                                                       */
/*  :id = our DB _id                                                    */
/* ------------------------------------------------------------------ */
export const confirmRedemption = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { id } = req.params;
    const { otp } = req.body;
    console.log(`\n✅ [CONFIRM REDEMPTION] redemptionId=${id} user=${uniqueId}`);

    if (!otp) {
      return res.status(400).json({ success: false, message: "otp is required" });
    }

    /* ---------- STEP 1: FETCH RECORD ---------- */
    const record = await MfRedemption.findOne({ _id: id, uniqueId }).select("+otpCode");
    if (!record) {
      return res.status(404).json({ success: false, message: "Redemption not found" });
    }
    if (record.consentGiven) {
      return res.status(400).json({ success: false, message: "Consent already given" });
    }
    console.log(`  [1/4] ✅ fpRedemptionId=${record.fpRedemptionId} state=${record.fpState}`);

    /* ---------- STEP 2: VERIFY OTP ---------- */
    const { valid, reason } = verifyConsentOtp(otp, record.otpCode, record.otpExpiresAt);
    if (!valid) {
      console.warn(`  [2/4] ❌ OTP invalid: ${reason}`);
      return res.status(400).json({ success: false, message: reason });
    }
    console.log(`  [2/4] ✅ OTP valid`);

    /* ---------- STEP 3: PATCH CONSENT + CONFIRMED ON FP ---------- */
    const mfData = await MfUserData.findOne({ uniqueId });
    let phone = mfData?.phone?.number;
    let email = mfData?.email?.email;
    if (!phone || !email) {
      const user = await User.findOne({ uniqueId });
      if (!phone) phone = user?.phone;
      if (!email) email = user?.email;
    }
    if (!phone || !email) {
      return res.status(400).json({
        success: false,
        message: "Phone and email are required for consent",
      });
    }

    const isd = mfData?.phone?.isd || "91";
    console.log(`  [3/4] Patching consent + confirmed on FP...`);
    const fpData = await patchFpRedemption({
      id:      record.fpRedemptionId,
      state:   "confirmed",
      consent: { email, isd_code: isd, mobile: phone },
    });
    console.log(`  [3/4] ✅ FP state=${fpData.state}`);

    /* ---------- STEP 4: SAVE TO DB ---------- */
    const updated = await MfRedemption.findOneAndUpdate(
      { _id: record._id },
      {
        $set: {
          fpState:      fpData.state ?? "confirmed",
          otpVerified:  true,
          consentGiven: true,
          consentAt:    new Date(),
          otpCode:      null,
          rawResponse:  fpData,
        },
      },
      { new: true }
    );
    console.log(`  [4/4] ✅ Done — state=${updated.fpState}`);

    return res.status(200).json({
      success: true,
      message: "Redemption confirmed successfully.",
      data: {
        redemptionId:   updated._id,
        fpRedemptionId: updated.fpRedemptionId,
        fpState:        updated.fpState,
        folioNumber:    updated.folioNumber,
        isin:           updated.isin,
        amount:         updated.amount,
        units:          updated.units,
        consentAt:      updated.consentAt,
      },
    });
  } catch (err) {
    console.error("❌ [CONFIRM REDEMPTION] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/redemption/:id/resend-otp                             */
/* ------------------------------------------------------------------ */
export const resendRedemptionOtp = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { id } = req.params;

    const record = await MfRedemption.findOne({ _id: id, uniqueId });
    if (!record) {
      return res.status(404).json({ success: false, message: "Redemption not found" });
    }
    if (record.consentGiven) {
      return res.status(400).json({ success: false, message: "Consent already given" });
    }

    const mfData = await MfUserData.findOne({ uniqueId });
    let phone = mfData?.phone?.number;
    let email = mfData?.email?.email;
    if (!phone || !email) {
      const user = await User.findOne({ uniqueId });
      if (!phone) phone = user?.phone;
      if (!email) email = user?.email;
    }
    if (!phone) {
      return res.status(400).json({ success: false, message: "No phone number found" });
    }

    const otp = generateOtp();
    const expiry = otpExpiresAt();
    await sendConsentOtp(phone, otp, email);

    await MfRedemption.updateOne(
      { _id: record._id },
      { $set: { otpCode: otp, otpExpiresAt: expiry, otpVerified: false } }
    );

    return res.status(200).json({
      success: true,
      message: "OTP resent successfully",
      otpExpiresAt: expiry,
    });
  } catch (err) {
    console.error("❌ [REDEMPTION] Resend OTP error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/redemption/:id                                          */
/*  Fetch single redemption (refreshes state from FP).                 */
/* ------------------------------------------------------------------ */
export const getRedemption = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { id } = req.params;

    const record = await MfRedemption.findOne({ _id: id, uniqueId });
    if (!record) {
      return res.status(404).json({ success: false, message: "Redemption not found" });
    }

    // Refresh state from FP
    try {
      const fpData = await fetchFpRedemption(record.fpRedemptionId);
      await MfRedemption.updateOne(
        { _id: record._id },
        { $set: { fpState: fpData.state, rawResponse: fpData } }
      );
      record.fpState = fpData.state;
    } catch {
      console.warn(`⚠️  [REDEMPTION] FP refresh failed, returning cached state`);
    }

    return res.status(200).json({
      success: true,
      data: {
        redemptionId:   record._id,
        fpRedemptionId: record.fpRedemptionId,
        folioNumber:    record.folioNumber,
        isin:           record.isin,
        amount:         record.amount,
        units:          record.units,
        fpState:        record.fpState,
        consentGiven:   record.consentGiven,
        consentAt:      record.consentAt,
        createdAt:      record.createdAt,
      },
    });
  } catch (err) {
    console.error("❌ [REDEMPTION] Get error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/redemption                                              */
/*  List all redemptions for authenticated user.                        */
/* ------------------------------------------------------------------ */
export const listRedemptions = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { state, isin } = req.query;

    const filter = { uniqueId };
    if (state) filter.fpState = state;
    if (isin)  filter.isin    = isin.toUpperCase();

    const redemptions = await MfRedemption.find(filter).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: redemptions.length,
      data: redemptions.map((r) => ({
        redemptionId:   r._id,
        fpRedemptionId: r.fpRedemptionId,
        folioNumber:    r.folioNumber,
        isin:           r.isin,
        amount:         r.amount,
        units:          r.units,
        fpState:        r.fpState,
        consentGiven:   r.consentGiven,
        createdAt:      r.createdAt,
      })),
    });
  } catch (err) {
    console.error("❌ [REDEMPTION] List error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/redemption/summary                                      */
/*  Pre-redemption summary: max/min instant redemption amounts.        */
/*                                                                      */
/*  Query: { folio, scheme }  (mf_investment_account auto from DB)     */
/* ------------------------------------------------------------------ */
export const getRedemptionSummary = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { folio, scheme } = req.query;

    if (!folio || !scheme) {
      return res.status(400).json({
        success: false,
        message: "folio and scheme (ISIN) are required query parameters",
      });
    }

    const mfData = await MfUserData.findOne({ uniqueId });
    const fpInvestmentAccountId = mfData?.investmentAccount?.fpInvestmentAccountId;

    if (!fpInvestmentAccountId) {
      return res.status(400).json({
        success: false,
        message: "MF investment account not found. Complete account setup first.",
      });
    }

    const fpResponse = await fetchFpRedemptionSummary({
      mf_investment_account: fpInvestmentAccountId,
      folio,
      scheme: scheme.toUpperCase().trim(),
    });

    return res.status(200).json({
      success: true,
      data: fpResponse,
    });
  } catch (err) {
    console.error("❌ [REDEMPTION SUMMARY] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
