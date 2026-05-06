import MfMandate from "../../../models/mf/mandate/mfMandate.model.js";
import MfUserData from "../../../models/mf/mfUserData.model.js";
import { fetchFpBankAccount } from "../../../utils/mf/onboarding/bankAccount.utils.js";
import {
  createFpMandate,
  authorizeFpMandate,
  authorizeFpMandateUpi,
  fetchFpMandate,
  cancelFpMandate,
  listFpMandates,
} from "../../../utils/mf/mandate/mandate.utils.js";

/* ------------------------------------------------------------------ */
/*  Internal — today and today+30y in yyyy-mm-dd                        */
/* ------------------------------------------------------------------ */
const toDateStr = (d) => d.toISOString().slice(0, 10);

const defaultDateRange = () => {
  const from = new Date();
  const to   = new Date(from);
  to.setFullYear(to.getFullYear() + 30);
  to.setDate(to.getDate() - 1); // FP requires valid_to < (valid_from + 30 years)
  return { validFrom: toDateStr(from), validTo: toDateStr(to) };
};

/* ------------------------------------------------------------------ */
/*  Internal — map FP mandate response → DB fields                      */
/* ------------------------------------------------------------------ */
const mandateFromFp = (fp) => ({
  mandateStatus:    fp.mandate_status ?? null,
  mandateRef:       fp.mandate_ref    ?? null,
  mandateToken:     fp.mandate_token  ?? null,
  umrn:             fp.umrn           ?? null,
  validFrom:        fp.valid_from     ?? null,
  validTo:          fp.valid_to       ?? null,
  fpCreatedAt:      fp.created_at   ? new Date(fp.created_at)   : null,
  fpApprovedAt:     fp.approved_at  ? new Date(fp.approved_at)  : null,
  fpCancelledAt:    fp.cancelled_at ? new Date(fp.cancelled_at) : null,
  fpRejectedAt:     fp.rejected_at  ? new Date(fp.rejected_at)  : null,
  fpRejectedReason: fp.rejected_reason ?? null,
  rawMandateResponse: fp,
});

/* ------------------------------------------------------------------ */
/*  POST /api/mf/mandate                                                */
/*  Creates a new eNACH or UPI Autopay mandate on FP.                  */
/*                                                                      */
/*  Body: {                                                             */
/*    mandate_type:  "E_MANDATE" | "UPI"                               */
/*    mandate_limit: Number  (max 10000000 for E_MANDATE, 100000 UPI)  */
/*  }                                                                   */
/* ------------------------------------------------------------------ */
export const createMandate = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { mandate_type, mandate_limit } = req.body;

    /* ---------- VALIDATE ---------- */
    if (!mandate_type || !["E_MANDATE", "UPI"].includes(mandate_type)) {
      return res.status(400).json({
        success: false,
        message: "mandate_type must be E_MANDATE or UPI",
      });
    }
    if (!mandate_limit || isNaN(Number(mandate_limit)) || Number(mandate_limit) <= 0) {
      return res.status(400).json({
        success: false,
        message: "mandate_limit must be a positive number",
      });
    }
    const limit = Number(mandate_limit);
    const maxLimit = mandate_type === "UPI" ? 100000 : 10000000;
    if (limit > maxLimit) {
      return res.status(400).json({
        success: false,
        message: `mandate_limit exceeds maximum of ₹${maxLimit.toLocaleString("en-IN")} for ${mandate_type}`,
      });
    }

    /* ---------- STEP 1: GET BANK ACCOUNT OLD_ID + INVESTMENT ACCOUNT ---------- */
    const mfData = await MfUserData.findOne({ uniqueId });
    const fpInvestmentAccountId = mfData?.investmentAccount?.fpInvestmentAccountId ?? null;
    let bankAccountOldId = mfData?.bankAccount?.fpBankAccountOldId ?? null;

    if (!bankAccountOldId && mfData?.bankAccount?.fpBankAccountId) {
      console.log(`  Fetching bank account old_id from FP...`);
      try {
        const fpBa = await fetchFpBankAccount(mfData.bankAccount.fpBankAccountId);
        bankAccountOldId = fpBa.old_id ?? null;
        if (bankAccountOldId) {
          await MfUserData.updateOne(
            { uniqueId },
            { $set: { "bankAccount.fpBankAccountOldId": bankAccountOldId } }
          );
        }
      } catch (e) {
        console.warn(`  ⚠️  Could not fetch bank account old_id: ${e.message}`);
      }
    }

    if (!bankAccountOldId) {
      return res.status(400).json({
        success: false,
        message: "Bank account not found or missing numeric ID. Complete bank account setup first.",
      });
    }

    /* ---------- STEP 2: BUILD DATE RANGE ---------- */
    const { validFrom, validTo } = defaultDateRange();

    /* ---------- STEP 3: CREATE MANDATE ON FP ---------- */
    const fpPayload = {
      mandate_type,
      bank_account_id: bankAccountOldId,
      mandate_limit:   limit,
      provider_name:   "CYBRILLAPOA",
      valid_from:      validFrom,
      valid_to:        validTo,
    };

    const fpResult = await createFpMandate(fpPayload);
    const fpMandateId = fpResult.id;

    /* ---------- STEP 4: SAVE TO DB ---------- */
    const record = await MfMandate.findOneAndUpdate(
      { fpMandateId },
      {
        $set: {
          uniqueId,
          fpMandateId,
          fpInvestmentAccountId,
          mandateType:        mandate_type,
          mandateLimit:       limit,
          providerName:       "CYBRILLAPOA",
          validFrom,
          validTo,
          fpBankAccountOldId: bankAccountOldId,
          mandateStatus:      "CREATED",
        },
      },
      { upsert: true, new: true }
    );

    return res.status(201).json({
      success: true,
      message: "Mandate created. Call POST /api/mf/mandate/:id/authorize to get payment URL.",
      data: {
        mandateId:     record._id,
        fpMandateId:   record.fpMandateId,
        mandateType:   record.mandateType,
        mandateLimit:  record.mandateLimit,
        mandateStatus: record.mandateStatus,
        validFrom:     record.validFrom,
        validTo:       record.validTo,
      },
    });
  } catch (err) {
    console.error("❌ [MANDATE] Create error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/mandate/:id/authorize                                  */
/*  Generates auth payment URL (token_url) for mandate authentication.  */
/*  :id = our DB _id                                                    */
/* ------------------------------------------------------------------ */
export const authorizeMandate = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { id } = req.params;
    const record = await MfMandate.findOne({ _id: id, uniqueId });
    if (!record) {
      return res.status(404).json({ success: false, message: "Mandate not found" });
    }
    if (!["CREATED", "created"].includes(record.mandateStatus)) {
      return res.status(400).json({
        success: false,
        message: `Cannot authorize mandate in ${record.mandateStatus} state. Only CREATED mandates can be authorized.`,
      });
    }

    const isUpi = record.mandateType === "UPI";

    let fpResult;
    let upiUri = null;

    if (isUpi) {
      // UPI Intent/QR flow — no postback URL, URI returned directly
      fpResult = await authorizeFpMandateUpi(record.fpMandateId);
      upiUri   = fpResult?.upi?.uri ?? null;
      console.log(`  ✅ [MANDATE AUTH UPI] paymentId=${fpResult.id} uri=${upiUri}`);
    } else {
      // E_MANDATE (eNACH) flow — redirect user to tokenUrl
      const mandateReturnUrl = `https://www.salaryplus.club/mandate/callback`;
      fpResult = await authorizeFpMandate({
        mandate_id:           record.fpMandateId,
        payment_postback_url: mandateReturnUrl,
      });
    }

    await MfMandate.updateOne(
      { _id: record._id },
      {
        $set: {
          fpPaymentId:     fpResult.id       ?? null,
          tokenUrl:        fpResult.token_url ?? null,
          upiUri:          upiUri,
          rawAuthResponse: fpResult,
        },
      }
    );

    return res.status(200).json({
      success: true,
      message: isUpi
        ? "Mandate authorization initiated. Use upiUri to complete UPI Autopay setup."
        : "Mandate authorization initiated. Redirect user to tokenUrl.",
      data: {
        mandateId:   record._id,
        fpMandateId: record.fpMandateId,
        fpPaymentId: fpResult.id,
        mandateType: record.mandateType,
        // E_MANDATE: redirect to tokenUrl; UPI: open upiUri
        tokenUrl:    fpResult.token_url ?? null,
        upiUri:      upiUri,
      },
    });
  } catch (err) {
    console.error("❌ [MANDATE] Authorize error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/mandate                                                  */
/*  List all mandates for the authenticated user.                       */
/* ------------------------------------------------------------------ */
export const listMandates = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { status } = req.query;

    const filter = { uniqueId };
    if (status) filter.mandateStatus = status.toUpperCase();

    const mandates = await MfMandate.find(filter).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: mandates.length,
      data: mandates.map(mandatePublicResponse),
    });
  } catch (err) {
    console.error("❌ [MANDATE] List error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/mandate/:id                                             */
/*  Get single mandate — refreshes state from FP.                      */
/* ------------------------------------------------------------------ */
export const getMandate = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { id } = req.params;

    const record = await MfMandate.findOne({ _id: id, uniqueId });
    if (!record) {
      return res.status(404).json({ success: false, message: "Mandate not found" });
    }

    // Refresh from FP
    try {
      const fpData = await fetchFpMandate(record.fpMandateId);
      await MfMandate.updateOne(
        { _id: record._id },
        { $set: mandateFromFp(fpData) }
      );
    } catch {
      console.warn(`⚠️  [MANDATE] FP refresh failed for ${record.fpMandateId}, returning cached`);
    }

    const updated = await MfMandate.findById(record._id);
    return res.status(200).json({
      success: true,
      data: mandatePublicResponse(updated),
    });
  } catch (err) {
    console.error("❌ [MANDATE] Get error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/mandate/:id/cancel                                     */
/*  Cancels an APPROVED mandate.                                        */
/* ------------------------------------------------------------------ */
export const cancelMandate = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { id } = req.params;

    const record = await MfMandate.findOne({ _id: id, uniqueId });
    if (!record) {
      return res.status(404).json({ success: false, message: "Mandate not found" });
    }
    if (!["APPROVED", "approved"].includes(record.mandateStatus)) {
      return res.status(400).json({
        success: false,
        message: `Only APPROVED mandates can be cancelled. Current status: ${record.mandateStatus}`,
      });
    }

    const fpData = await cancelFpMandate(record.fpMandateId);

    await MfMandate.updateOne(
      { _id: record._id },
      { $set: mandateFromFp(fpData) }
    );

    return res.status(200).json({
      success: true,
      message: "Mandate cancelled successfully",
      data: { mandateId: record._id, mandateStatus: fpData.mandate_status },
    });
  } catch (err) {
    console.error("❌ [MANDATE] Cancel error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/mandate/auth-callback                                  */
/*  Postback from FP after mandate auth attempt (no auth middleware).   */
/*  FP HTTP form POST: { paymentId, status, failureReason }             */
/* ------------------------------------------------------------------ */
export const mandateAuthCallback = async (req, res) => {
  try {
    const { paymentId, status, failureReason } = req.body;
    console.log(`\n📩 [MANDATE CALLBACK] paymentId=${paymentId} status=${status} failureReason=${failureReason}`);

    if (!paymentId) {
      console.warn(`  ⚠️  No paymentId in mandate callback — ignoring`);
      return res.status(200).send("OK");
    }

    const record = await MfMandate.findOne({ fpPaymentId: Number(paymentId) });
    if (!record) {
      console.warn(`  ⚠️  No mandate found for fpPaymentId=${paymentId}`);
      return res.status(200).send("OK");
    }

    // Refresh mandate state from FP to get latest mandateStatus
    try {
      const fpData = await fetchFpMandate(record.fpMandateId);
      await MfMandate.updateOne(
        { _id: record._id },
        {
          $set: {
            ...mandateFromFp(fpData),
            authStatus:        status ?? null,
            authFailureReason: failureReason || null,
          },
        }
      );
      console.log(`  ✅ Mandate ${record._id} refreshed — status=${fpData.mandate_status}`);
    } catch (e) {
      console.error(`  ❌ FP refresh failed: ${e.message}`);
      // Still save auth status even if FP refresh fails
      await MfMandate.updateOne(
        { _id: record._id },
        { $set: { authStatus: status ?? null, authFailureReason: failureReason || null } }
      );
    }

    return res.status(200).send("OK");
  } catch (err) {
    console.error("❌ [MANDATE CALLBACK] Error:", err.message);
    return res.status(200).send("OK");
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/mandate/fp                                              */
/*  Fetches mandate list directly from FP (not our DB).                 */
/*  Query: ?bank_account_id=<fpBankAccountOldId>&page=0&size=20         */
/* ------------------------------------------------------------------ */
export const getMandatesFromFp = async (req, res) => {
  try {
    const { bank_account_id, page = 0, size = 20 } = req.query;

    const clampedSize = Math.min(Number(size) || 20, 100);
    const fpData = await listFpMandates({
      bank_account_id: bank_account_id ? Number(bank_account_id) : undefined,
      page:            Number(page) || 0,
      size:            clampedSize,
    });

    const approvedMandates = (fpData?.mandates ?? []).filter(
      (m) => m.mandate_status === "APPROVED"
    );

    return res.status(200).json({
      success: true,
      count:   approvedMandates.length,
      data:    approvedMandates,
    });
  } catch (err) {
    console.error("❌ [MANDATE] FP list error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  Internal — public response shape                                    */
/* ------------------------------------------------------------------ */
const mandatePublicResponse = (m) => ({
  mandateId:             m._id,
  fpMandateId:           m.fpMandateId,
  fpInvestmentAccountId: m.fpInvestmentAccountId,
  mandateType:           m.mandateType,
  mandateLimit:      m.mandateLimit,
  mandateStatus:     m.mandateStatus,
  providerName:      m.providerName,
  validFrom:         m.validFrom,
  validTo:           m.validTo,
  mandateRef:        m.mandateRef,
  umrn:              m.umrn,
  authStatus:        m.authStatus,
  tokenUrl:          m.tokenUrl,
  upiUri:            m.upiUri,
  fpPaymentId:       m.fpPaymentId,
  fpApprovedAt:      m.fpApprovedAt,
  fpCancelledAt:     m.fpCancelledAt,
  fpRejectedAt:      m.fpRejectedAt,
  fpRejectedReason:  m.fpRejectedReason,
  createdAt:         m.createdAt,
});
