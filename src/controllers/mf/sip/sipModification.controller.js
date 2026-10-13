import MfSip from "../../../models/mf/sip/mfSip.model.js";
import MfUserData from "../../../models/mf/mfUserData.model.js";
import {
  createFpModificationInstruction,
  fetchFpModificationInstruction,
} from "../../../utils/mf/sip/sip.utils.js";

/* ------------------------------------------------------------------ */
/*  Internal — build consent object from stored user data.             */
/* ------------------------------------------------------------------ */
const buildConsent = (userData) => {
  const consent = {};
  const email  = userData?.email?.email ?? null;
  const mobile = userData?.phone?.number ?? null;
  const isd    = userData?.phone?.isd ?? "91";

  if (email)  consent.email = email;
  if (mobile) { consent.isd_code = isd; consent.mobile = mobile; }

  if (!consent.email && !consent.mobile) {
    throw Object.assign(new Error("No email or mobile found for this user — cannot build consent"), { statusCode: 400 });
  }
  return consent;
};

/* ================================================================
 * POST /api/mf/sip/:sipId/modify/amount
 *
 * Change the installment amount of an active SIP.
 * :sipId = FP plan id (mfpp_xxx) from GET /api/mf/sip
 * Body: { amount: <new_amount> }
 * ================================================================ */
export const createAmountModification = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { sipId } = req.params;
    const { amount } = req.body;

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: "amount is required and must be a positive number" });
    }

    const sipRecord = await MfSip.findOne({ fpSipId: sipId, uniqueId }).lean();
    if (!sipRecord) return res.status(404).json({ success: false, message: "SIP not found" });

    const userData = await MfUserData.findOne({ uniqueId }, { "email.email": 1, "phone.number": 1, "phone.isd": 1 }).lean();
    const consent = buildConsent(userData);

    const result = await createFpModificationInstruction({
      plan:    sipId,
      amount:  Number(amount),
      consent,
    });

    return res.status(201).json({
      success: true,
      message: "Amount modification instruction created",
      data: result,
    });
  } catch (err) {
    console.error("❌ [SIP MODIFY] Amount error:", err.message);
    return res.status(err.statusCode ?? 500).json({ success: false, message: err.message });
  }
};

/* ================================================================
 * POST /api/mf/sip/:sipId/modify/mandate
 *
 * Change the mandate linked to an active SIP.
 * :sipId = FP plan id (mfpp_xxx) from GET /api/mf/sip
 * Body: { payment_source: <new_mandate_old_id> }
 *   payment_source is the integer old_id of the new mandate
 *   (from GET /api/mf/mandate or GET /api/mf/bank-account)
 * ================================================================ */
export const createMandateModification = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { sipId } = req.params;
    const { payment_source } = req.body;

    if (!payment_source) {
      return res.status(400).json({ success: false, message: "payment_source (new mandate old_id) is required" });
    }

    const sipRecord = await MfSip.findOne({ fpSipId: sipId, uniqueId }).lean();
    if (!sipRecord) return res.status(404).json({ success: false, message: "SIP not found" });

    const userData = await MfUserData.findOne({ uniqueId }, { "email.email": 1, "phone.number": 1, "phone.isd": 1 }).lean();
    const consent = buildConsent(userData);

    const result = await createFpModificationInstruction({
      plan:           sipId,
      payment_method: "mandate",
      payment_source: Number(payment_source),
      consent,
    });

    return res.status(201).json({
      success: true,
      message: "Mandate modification instruction created",
      data: result,
    });
  } catch (err) {
    console.error("❌ [SIP MODIFY] Mandate error:", err.message);
    return res.status(err.statusCode ?? 500).json({ success: false, message: err.message });
  }
};

/* ================================================================
 * GET /api/mf/sip/modify/:modificationId
 *
 * Fetch a modification instruction by its FP id (mpmi_xxx).
 * ================================================================ */
export const getModificationInstruction = async (req, res) => {
  try {
    const { modificationId } = req.params;
    const result = await fetchFpModificationInstruction(modificationId);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error("❌ [SIP MODIFY] Fetch error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ================================================================
 * ADMIN — POST /api/mf/admin/sip/:fpSipId/modify/amount
 * Body: { amount, uniqueId }
 *   uniqueId: whose consent/email/mobile to use
 * ================================================================ */
export const adminCreateAmountModification = async (req, res) => {
  try {
    const { fpSipId } = req.params;
    const { amount, uniqueId } = req.body;

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: "amount is required and must be a positive number" });
    }
    if (!uniqueId) {
      return res.status(400).json({ success: false, message: "uniqueId is required to build consent" });
    }

    const userData = await MfUserData.findOne({ uniqueId }, { "email.email": 1, "phone.number": 1, "phone.isd": 1 }).lean();
    const consent = buildConsent(userData);

    const result = await createFpModificationInstruction({
      plan:    fpSipId,
      amount:  Number(amount),
      consent,
    });

    return res.status(201).json({
      success: true,
      message: "Amount modification instruction created",
      data: result,
    });
  } catch (err) {
    console.error("❌ [ADMIN SIP MODIFY] Amount error:", err.message);
    return res.status(err.statusCode ?? 500).json({ success: false, message: err.message });
  }
};

/* ================================================================
 * ADMIN — POST /api/mf/admin/sip/:fpSipId/modify/mandate
 * Body: { payment_source, uniqueId }
 * ================================================================ */
export const adminCreateMandateModification = async (req, res) => {
  try {
    const { fpSipId } = req.params;
    const { payment_source, uniqueId } = req.body;

    if (!payment_source) {
      return res.status(400).json({ success: false, message: "payment_source (new mandate old_id) is required" });
    }
    if (!uniqueId) {
      return res.status(400).json({ success: false, message: "uniqueId is required to build consent" });
    }

    const userData = await MfUserData.findOne({ uniqueId }, { "email.email": 1, "phone.number": 1, "phone.isd": 1 }).lean();
    const consent = buildConsent(userData);

    const result = await createFpModificationInstruction({
      plan:           fpSipId,
      payment_method: "mandate",
      payment_source: Number(payment_source),
      consent,
    });

    return res.status(201).json({
      success: true,
      message: "Mandate modification instruction created",
      data: result,
    });
  } catch (err) {
    console.error("❌ [ADMIN SIP MODIFY] Mandate error:", err.message);
    return res.status(err.statusCode ?? 500).json({ success: false, message: err.message });
  }
};

/* ================================================================
 * ADMIN — GET /api/mf/admin/sip/modify/:modificationId
 * ================================================================ */
export const adminGetModificationInstruction = async (req, res) => {
  try {
    const { modificationId } = req.params;
    const result = await fetchFpModificationInstruction(modificationId);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error("❌ [ADMIN SIP MODIFY] Fetch error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
