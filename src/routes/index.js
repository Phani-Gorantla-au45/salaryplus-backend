import { Router } from "express";

import authRoutes from "./auth.routes.js";
import goldRoutes from "./gold/gold.routes.js";
import masterRoutes from "./gold/master.routes.js";
import kycRoutes from "./gold/kyc.routes.js";
import augmontRoutes from "./gold/augmont.routes.js";
import bankRoutes from "./gold/bank.routes.js";
import productRoutes from "./gold/product.routes.js";
import paymentRoutes from "./payment/payment.routes.js";
import bondRoutes from "./bonds/bond.routes.js";
import bondDetailsRoutes from "./bonds/bondDetails.routes.js";
import bookBondRoutes from "./bonds/bookBond.routes.js";
import sbOnboardingRoutes from "./bonds/sbOnboarding.routes.js";
import sbKycRoutes from "./bonds/sbKyc.routes.js";
import bwBondKycRoutes from "./bonds/bwBondKyc.routes.js";
import bwBondKycAdminRoutes from "./bonds/bwBondKycAdmin.routes.js";
import bwUsersAdminRoutes from "./admin/bwUsers.routes.js";
import bwBondUploadRoutes from "./bonds/bwBondUpload.routes.js";
import bwBondPortfolioRoutes from "./bonds/bwBondPortfolio.routes.js";
// MF KYC
import mfKycRoutes             from "./mf/kyc/kyc.routes.js";
import mfKycRequestRoutes      from "./mf/kyc/kycRequest.routes.js";
import mfIdentityDocumentRoutes from "./mf/kyc/identityDocument.routes.js";
import mfEsignRoutes           from "./mf/kyc/esign.routes.js";
import mfFileRoutes            from "./mf/kyc/file.routes.js";
// MF Onboarding
import mfRiskProfileRoutes      from "./mf/onboarding/riskProfile.routes.js";
import mfAccountPrefillRoutes   from "./mf/onboarding/accountPrefill.routes.js";
import mfInvestorProfileRoutes  from "./mf/onboarding/investorProfile.routes.js";
import mfPhoneNumberRoutes      from "./mf/onboarding/phoneNumber.routes.js";
import mfEmailAddressRoutes     from "./mf/onboarding/emailAddress.routes.js";
import mfAddressRoutes          from "./mf/onboarding/address.routes.js";
import mfBankAccountRoutes      from "./mf/onboarding/bankAccount.routes.js";
import mfRelatedPartyRoutes     from "./mf/onboarding/relatedParty.routes.js";
import mfInvestmentAccountRoutes from "./mf/onboarding/mfInvestmentAccount.routes.js";
import mfJourneyStatusRoutes    from "./mf/onboarding/journeyStatus.routes.js";
import mfAmcRoutes          from "./mf/master/amc.routes.js";
import mfSchemePlanRoutes   from "./mf/master/schemePlan.routes.js";
import mfDailySipFundRoutes from "./mf/master/dailySipFund.routes.js";
import mfPurchaseRoutes       from "./mf/purchase/mfPurchase.routes.js";
import mfBasketPurchaseRoutes from "./mf/purchase/mfBasketPurchase.routes.js";
import mfBasketRoutes from "./mf/mfBasket.routes.js";
import mfAdminBasketRoutes from "./mf/admin/mfBasket.routes.js";
import mfAdminFolioRoutes  from "./mf/admin/folio.routes.js";
import mfAdminSipRoutes             from "./mf/admin/sip.routes.js";
import mfAdminInvestorProfileRoutes    from "./mf/admin/investorProfile.routes.js";
import mfAdminInvestmentAccountRoutes  from "./mf/admin/mfInvestmentAccount.routes.js";
import mfAdminPaymentRoutes            from "./mf/admin/payment.routes.js";
import mfAdminHoldingsRoutes           from "./mf/admin/holdings.routes.js";
import mfAdminReturnsRoutes            from "./mf/admin/returns.routes.js";
import mfAdminTransactionsRoutes       from "./mf/admin/transactions.routes.js";
import mfHoldingsRoutes    from "./mf/reports/holdings.routes.js";
import mfReturnsRoutes       from "./mf/reports/returns.routes.js";
import mfTransactionsRoutes  from "./mf/reports/transactions.routes.js";
import mfMandateRoutes       from "./mf/mandate/mandate.routes.js";
import mfCuratedBasketRoutes from "./mf/curatedBasket.routes.js";
import mfSipRoutes       from "./mf/sip/mfSip.routes.js";
import mfBasketSipRoutes  from "./mf/sip/mfBasketSip.routes.js";
import mfRedemptionRoutes  from "./mf/redemption/mfRedemption.routes.js";
import mfUserTransactionRoutes from "./mf/transactions.routes.js";
import mfSmartSavingRoutes from "./mf/smartSaving/smartSaving.routes.js";
import appVersionRoutes    from "./app/appVersion.routes.js";
import goalRoutes          from "./goals/goal.routes.js";
import customGoalRoutes    from "./goals/userCustomGoal.routes.js";
// SafeGold
import safegoldUserRoutes from "./safegold/user.routes.js";
// Migration (BSE → platform bulk onboarding)
import migrationRoutes from "./migration/migration.routes.js";
// MF Webhooks
import mfFpWebhookRoutes       from "./mf/webhook/fpWebhook.routes.js";
import mfFpWebhookManageRoutes from "./mf/webhook/fpWebhookManage.routes.js";

const router = Router();

router.use("/api/registration", authRoutes);
router.use("/api/gold", goldRoutes);
router.use("/api/augmont/master", masterRoutes);
router.use("/api/kyc/", kycRoutes);
router.use("/api/bank/", bankRoutes);
router.use("/api/products", productRoutes);
router.use("/api/juspay", paymentRoutes);
router.use("/api/bonds", bondRoutes);
router.use("/api/bonddetails", bondDetailsRoutes);
router.use("/api/book", bookBondRoutes);
router.use("/api/sbOnboarding", sbOnboardingRoutes);
router.use("/api/kyc", sbKycRoutes);
router.use("/api/bw/bonds/kyc", bwBondUploadRoutes);
router.use("/api/bw/bonds", bwBondPortfolioRoutes);
router.use("/api/bw/bonds/kyc", bwBondKycRoutes);
router.use("/api/bw/admin/bonds/kyc", bwBondKycAdminRoutes);
router.use("/api/bw/admin/users", bwUsersAdminRoutes);
router.use(augmontRoutes); // flat mount for /merchant/v1/buy and /sell

// Mutual Funds
router.use("/api/mf/kyc", mfKycRoutes);
router.use("/api/mf/kyc-request", mfKycRequestRoutes);
router.use("/api/mf/identity-document", mfIdentityDocumentRoutes);
router.use("/api/mf/esign", mfEsignRoutes);
router.use("/api/mf/file", mfFileRoutes);
router.use("/api/mf/risk-profile", mfRiskProfileRoutes);
router.use("/api/mf/journey-status", mfJourneyStatusRoutes);
router.use("/api/mf/investor-profile", mfInvestorProfileRoutes);
router.use("/api/mf/phone-number", mfPhoneNumberRoutes);
router.use("/api/mf/email-address", mfEmailAddressRoutes);
router.use("/api/mf/address", mfAddressRoutes);
router.use("/api/mf/related-party", mfRelatedPartyRoutes);
router.use("/api/mf/bank-account", mfBankAccountRoutes);
router.use("/api/mf/investment-account", mfInvestmentAccountRoutes);
router.use("/api/mf/account", mfAccountPrefillRoutes);

// MF Master Data
router.use("/api/mf/master/amcs",           mfAmcRoutes);
router.use("/api/mf/master/scheme-plans",   mfSchemePlanRoutes);
router.use("/api/mf/master/daily-sip-funds", mfDailySipFundRoutes);

// MF Basket (fund listing for frontend)
router.use("/api/mf/basket", mfBasketRoutes);

// MF Admin
router.use("/api/mf/admin/basket",  mfAdminBasketRoutes);
router.use("/api/mf/admin/folios",  mfAdminFolioRoutes);
router.use("/api/mf/admin/sip",               mfAdminSipRoutes);
router.use("/api/mf/admin/investor-profiles",   mfAdminInvestorProfileRoutes);
router.use("/api/mf/admin/investment-accounts", mfAdminInvestmentAccountRoutes);
router.use("/api/mf/admin/payments",            mfAdminPaymentRoutes);
router.use("/api/mf/admin/holdings",            mfAdminHoldingsRoutes);
router.use("/api/mf/admin/returns",             mfAdminReturnsRoutes);
router.use("/api/mf/admin/transactions",        mfAdminTransactionsRoutes);

// MF Curated Baskets — public user-facing view
router.use("/api/mf/curated-basket", mfCuratedBasketRoutes);

// MF Reports
router.use("/api/mf/reports/holdings",      mfHoldingsRoutes);
router.use("/api/mf/reports/returns",       mfReturnsRoutes);
router.use("/api/mf/reports/transactions",  mfTransactionsRoutes);

// MF Mandate (eNACH / UPI Autopay)
router.use("/api/mf/mandate", mfMandateRoutes);

// MF Transactions
router.use("/api/mf/purchase",        mfPurchaseRoutes);
router.use("/api/mf/basket-purchase", mfBasketPurchaseRoutes);

// MF SIP
router.use("/api/mf/sip",        mfSipRoutes);
router.use("/api/mf/basket-sip", mfBasketSipRoutes);

// MF Redemption (Withdraw)
router.use("/api/mf/redemption", mfRedemptionRoutes);

// MF Transaction History (purchases + redemptions unified)
router.use("/api/mf/transactions", mfUserTransactionRoutes);

// MF Smart Saving (Instant Liquid Fund)
router.use("/api/mf/smart-saving", mfSmartSavingRoutes);

// App Version / Force Update
router.use("/api/app", appVersionRoutes);

// Goal-based Financial Planning
router.use("/api/goals", goalRoutes);
router.use("/api/custom-goals", customGoalRoutes);

// MF Webhooks (FP → our server)
router.use("/api/mf/webhook/fp",        mfFpWebhookRoutes);       // public — receives FP events
router.use("/api/mf/admin/webhook/fp",  mfFpWebhookManageRoutes); // admin — manage + event log

// SafeGold
router.use("/api/safegold/user", safegoldUserRoutes);

// Migration (BSE → platform bulk onboarding)
router.use("/api/migration", migrationRoutes);

export default router;
