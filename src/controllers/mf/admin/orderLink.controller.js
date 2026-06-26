import crypto from "crypto";

import MfPurchase from "../../../models/mf/purchase/mfPurchase.model.js";
import MfUserData from "../../../models/mf/mfUserData.model.js";
import MfSchemePlan from "../../../models/mf/master/mfSchemePlan.model.js";
import RegistrationUser from "../../../models/user/user.model.js";
import AdminOrderLink from "../../../models/mf/adminOrderLink.model.js";

import { createFpPurchase } from "../../../utils/mf/purchase/purchase.utils.js";
import { createFpBatchPurchase } from "../../../utils/mf/purchase/batchPurchase.utils.js";
import { fetchFpSchemePlan } from "../../../utils/mf/master/schemePlan.utils.js";

const LINK_VALID_HOURS = 48;

/**
 * NEW, independent flow for admin-initiated orders shared as a payment
 * link. This does not modify or call into the existing user-facing
 * mfPurchase.controller.js / mfBasketPurchase.controller.js — it creates
 * orders using the exact same underlying FP utilities and the exact same
 * MfPurchase collection, just from a separate admin-only entry point.
 */

/* ------------------------------------------------------------------ */
/*  Internal — scheme plan resolution (cache-first, live fallback).     */
/*  Mirrors the equivalent private helper in mfPurchase.controller.js   */
/*  without touching that file.                                        */
/* ------------------------------------------------------------------ */
const resolveScheme = async (isin) => {
  const upper = isin?.toUpperCase().trim();
  let scheme = await MfSchemePlan.findOne({ isin: upper });

  if (!scheme?.syncedAt) {
    const fpData = await fetchFpSchemePlan(upper);
    scheme = await MfSchemePlan.findOneAndUpdate(
      { isin: upper },
      {
        $set: {
          isin: fpData.isin?.toUpperCase() || upper,
          gateway: fpData.gateway || "cybrillapoa",
          schemeName: fpData.mf_scheme?.name ?? null,
          fundName: fpData.mf_fund?.name ?? null,
          type: fpData.type,
          option: fpData.option,
          active: fpData.active ?? true,
          thresholds: fpData.thresholds ?? [],
          syncedAt: new Date(),
        },
      },
      { upsert: true, new: true },
    );
  }

  if (!scheme) throw new Error(`Scheme not found for ISIN: ${upper}`);
  return scheme;
};

const buildShareUrl = (token) => `${process.env.APP_URL}/api/mf/pay/${token}`;

/* ================================================================
 * POST /api/mf/admin/order-links/single
 * Body: { uniqueId, isin, amount, payment_method, folio_number? }
 * ================================================================ */
export const createSingleOrderLink = async (req, res) => {
  try {
    const { uniqueId, isin, amount, payment_method, folio_number } = req.body;
    const adminUniqueId = req.admin?.uniqueId ?? null;

    if (!uniqueId || !isin || !amount || !payment_method) {
      return res.status(400).json({
        success: false,
        message: "uniqueId, isin, amount and payment_method are required",
      });
    }
    if (!["NETBANKING", "UPI"].includes(payment_method)) {
      return res.status(400).json({ success: false, message: "payment_method must be NETBANKING or UPI" });
    }
    if (isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: "amount must be a positive number" });
    }

    const mfData = await MfUserData.findOne({ uniqueId });
    const fpInvestmentAccountId = mfData?.investmentAccount?.fpInvestmentAccountId;
    if (!fpInvestmentAccountId) {
      return res.status(400).json({ success: false, message: "This user has no MF investment account set up yet" });
    }

    const scheme = await resolveScheme(isin);
    if (!scheme.active) {
      return res.status(400).json({ success: false, message: `Scheme ${isin} is currently inactive` });
    }

    const fpData = await createFpPurchase({
      mf_investment_account: fpInvestmentAccountId,
      scheme: scheme.isin,
      amount: Number(amount),
      user_ip: "127.0.0.1",
      ...(folio_number && { folio_number: String(folio_number) }),
    });

    const purchase = await MfPurchase.findOneAndUpdate(
      { fpPurchaseId: fpData.id },
      {
        $set: {
          uniqueId,
          fpPurchaseId: fpData.id,
          fpOldId: fpData.old_id ?? null,
          mfInvestmentAccountId: fpInvestmentAccountId,
          fpState: fpData.state ?? "created",
          rawPurchaseResponse: fpData,
          isin: scheme.isin,
          schemeName: scheme.schemeName,
          fundName: scheme.fundName,
          amount: Number(amount),
          paymentMethod: payment_method,
          otpVerified: false,
        },
      },
      { upsert: true, new: true },
    );

    const shareToken = crypto.randomBytes(24).toString("hex");
    const link = await AdminOrderLink.create({
      purchaseId: purchase._id,
      uniqueId,
      isBasketOrder: false,
      shareToken,
      createdByAdmin: adminUniqueId,
      expiresAt: new Date(Date.now() + LINK_VALID_HOURS * 60 * 60 * 1000),
    });

    return res.status(201).json({
      success: true,
      message: "Order created. Share this link with the investor to complete payment.",
      data: {
        linkId: link._id,
        shareUrl: buildShareUrl(shareToken),
        expiresAt: link.expiresAt,
        purchase: { purchaseId: purchase._id, isin: purchase.isin, schemeName: purchase.schemeName, amount: purchase.amount },
      },
    });
  } catch (err) {
    console.error("❌ [ADMIN ORDER LINK] Single create error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ================================================================
 * POST /api/mf/admin/order-links/basket
 * Body: { uniqueId, mf_purchases: [{ isin, amount }], payment_method }
 * ================================================================ */
export const createBasketOrderLink = async (req, res) => {
  try {
    const { uniqueId, mf_purchases, payment_method } = req.body;
    const adminUniqueId = req.admin?.uniqueId ?? null;

    if (!uniqueId || !Array.isArray(mf_purchases) || mf_purchases.length === 0 || !payment_method) {
      return res.status(400).json({
        success: false,
        message: "uniqueId, payment_method and a non-empty mf_purchases array are required",
      });
    }
    if (!["NETBANKING", "UPI"].includes(payment_method)) {
      return res.status(400).json({ success: false, message: "payment_method must be NETBANKING or UPI" });
    }
    for (const p of mf_purchases) {
      if (!p.isin || !p.amount || isNaN(Number(p.amount)) || Number(p.amount) <= 0) {
        return res.status(400).json({ success: false, message: "Each entry needs isin and a positive amount" });
      }
    }

    const mfData = await MfUserData.findOne({ uniqueId });
    const fpInvestmentAccountId = mfData?.investmentAccount?.fpInvestmentAccountId;
    if (!fpInvestmentAccountId) {
      return res.status(400).json({ success: false, message: "This user has no MF investment account set up yet" });
    }

    const fpPayload = mf_purchases.map((p) => ({
      amount: Number(p.amount),
      mf_investment_account: fpInvestmentAccountId,
      scheme: p.isin.toUpperCase().trim(),
      gateway: "ondc",
      user_ip: "127.0.0.1",
      ...(p.folio_number && { folio_number: p.folio_number }),
    }));

    const fpOrders = await createFpBatchPurchase(fpPayload);
    if (!fpOrders.length) throw new Error("FP returned no orders in batch response");

    const primaryOrder = fpOrders[0];
    const totalAmount = mf_purchases.reduce((s, p) => s + Number(p.amount), 0);
    const basketOrders = fpOrders.map((o, i) => ({
      fpPurchaseId: o.id,
      fpOldId: o.old_id ?? null,
      isin: o.scheme ?? mf_purchases[i]?.isin?.toUpperCase() ?? null,
      amount: o.amount ?? Number(mf_purchases[i]?.amount),
      fpState: o.state ?? "created",
    }));

    const purchase = await MfPurchase.findOneAndUpdate(
      { fpPurchaseId: primaryOrder.id },
      {
        $set: {
          uniqueId,
          fpPurchaseId: primaryOrder.id,
          fpOldId: primaryOrder.old_id ?? null,
          mfInvestmentAccountId: fpInvestmentAccountId,
          amount: totalAmount,
          isBasketOrder: true,
          basketFunds: mf_purchases.map((p) => ({
            isin: p.isin.toUpperCase().trim(),
            amount: Number(p.amount),
            ...(p.folio_number && { folioNumber: p.folio_number }),
          })),
          basketOrders,
          fpOldIds: basketOrders.map((o) => o.fpOldId).filter(Boolean),
          paymentMethod: payment_method,
          fpState: primaryOrder.state ?? "created",
          otpVerified: false,
        },
      },
      { upsert: true, new: true },
    );

    const shareToken = crypto.randomBytes(24).toString("hex");
    const link = await AdminOrderLink.create({
      purchaseId: purchase._id,
      uniqueId,
      isBasketOrder: true,
      shareToken,
      createdByAdmin: adminUniqueId,
      expiresAt: new Date(Date.now() + LINK_VALID_HOURS * 60 * 60 * 1000),
    });

    return res.status(201).json({
      success: true,
      message: "Basket order created. Share this link with the investor to complete payment.",
      data: {
        linkId: link._id,
        shareUrl: buildShareUrl(shareToken),
        expiresAt: link.expiresAt,
        purchase: { purchaseId: purchase._id, amount: purchase.amount, funds: purchase.basketFunds },
      },
    });
  } catch (err) {
    console.error("❌ [ADMIN ORDER LINK] Basket create error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ================================================================
 * GET /api/mf/admin/order-links
 * ================================================================ */
export const listOrderLinks = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const links = await AdminOrderLink.find(filter).sort({ createdAt: -1 }).populate("purchaseId").lean();

    const uniqueIds = [...new Set(links.map((l) => l.uniqueId))];
    const users = await RegistrationUser.find(
      { uniqueId: { $in: uniqueIds } },
      { uniqueId: 1, First_name: 1, Last_name: 1, phone: 1 },
    ).lean();
    const userMap = Object.fromEntries(users.map((u) => [u.uniqueId, u]));

    return res.status(200).json({
      success: true,
      count: links.length,
      data: links.map((l) => ({
        linkId: l._id,
        shareUrl: buildShareUrl(l.shareToken),
        status: l.status,
        isBasketOrder: l.isBasketOrder,
        expiresAt: l.expiresAt,
        createdAt: l.createdAt,
        purchase: l.purchaseId,
        user: userMap[l.uniqueId]
          ? { uniqueId: l.uniqueId, name: [userMap[l.uniqueId].First_name, userMap[l.uniqueId].Last_name].filter(Boolean).join(" "), phone: userMap[l.uniqueId].phone }
          : null,
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ================================================================
 * GET /api/mf/admin/order-links/:id
 * ================================================================ */
export const getOrderLink = async (req, res) => {
  try {
    const link = await AdminOrderLink.findById(req.params.id).populate("purchaseId").lean();
    if (!link) return res.status(404).json({ success: false, message: "Order link not found" });

    return res.status(200).json({
      success: true,
      data: { ...link, shareUrl: buildShareUrl(link.shareToken) },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ================================================================
 * POST /api/mf/admin/order-links/:id/cancel
 * ================================================================ */
export const cancelOrderLink = async (req, res) => {
  try {
    const link = await AdminOrderLink.findById(req.params.id);
    if (!link) return res.status(404).json({ success: false, message: "Order link not found" });

    if (["completed", "payment_created"].includes(link.status)) {
      return res.status(400).json({ success: false, message: `Cannot cancel — link is already ${link.status}` });
    }

    link.status = "cancelled";
    await link.save();

    return res.status(200).json({ success: true, message: "Order link cancelled" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
