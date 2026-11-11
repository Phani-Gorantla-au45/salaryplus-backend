import express from "express";
import { auth } from "../../middlewares/auth.middleware.js";
import { asFamilyMember } from "../../middlewares/familyMember.middleware.js";
import {
  initiateLink,
  resendLinkOtp,
  verifyLink,
  listMembers,
  removeMember,
  listViewers,
  removeViewer,
} from "../../controllers/family/familyLink.controller.js";

// Existing controllers — reused AS-IS. asFamilyMember scopes req.user to the
// linked member before they run; nothing in these controllers is changed.
import { getHoldings } from "../../controllers/mf/reports/holdings.controller.js";
import { getInvestmentReturns, getSchemeReturns } from "../../controllers/mf/reports/returns.controller.js";
import { getTransactions as getFolioTransactions } from "../../controllers/mf/reports/transactions.controller.js";
import { listTransactions } from "../../controllers/mf/transactions.controller.js";
import { listSips } from "../../controllers/mf/sip/mfSip.controller.js";
import { getBwBondPortfolioSummary, getBondPayoutSchedule } from "../../controllers/bonds/bwBondPortfolio.controller.js";

/* ------------------------------------------------------------------ */
/*  /api/family — Family Portfolio (NEW, additive)                      */
/*                                                                      */
/*  Member data is READ-ONLY here: only the GET routes below can be     */
/*  reached on behalf of a linked member. Nothing else is exposed.      */
/* ------------------------------------------------------------------ */
const router = express.Router();

/* ---------- Linking ---------- */
router.post("/links/initiate",        auth, initiateLink);
router.post("/links/:linkId/resend",  auth, resendLinkOtp);
router.post("/links/:linkId/verify",  auth, verifyLink);
router.delete("/links/:linkId",       auth, removeMember);

router.get("/members",                auth, listMembers);
router.get("/viewers",                auth, listViewers);
router.delete("/viewers/:linkId",     auth, removeViewer);

/* ---------- A linked member's portfolio (read-only allowlist) ---------- */
const m = "/members/:linkId";
router.get(`${m}/mf/returns`,           auth, asFamilyMember, getInvestmentReturns);
router.get(`${m}/mf/returns/schemes`,   auth, asFamilyMember, getSchemeReturns);
router.get(`${m}/mf/holdings`,          auth, asFamilyMember, getHoldings);
router.get(`${m}/mf/folio-transactions`,auth, asFamilyMember, getFolioTransactions);
router.get(`${m}/mf/transactions`,      auth, asFamilyMember, listTransactions);
router.get(`${m}/mf/sips`,              auth, asFamilyMember, listSips);
router.get(`${m}/bonds/summary`,        auth, asFamilyMember, getBwBondPortfolioSummary);
router.get(`${m}/bonds/:isin/schedule`, auth, asFamilyMember, getBondPayoutSchedule);

export default router;
