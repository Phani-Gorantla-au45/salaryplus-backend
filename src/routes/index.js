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
import sbKycRoutes from "./bonds/SBkyc.routes.js";
import mfKycRoutes from "./mf/kyc.routes.js";
import mfKycRequestRoutes from "./mf/kycRequest.routes.js";
import mfIdentityDocumentRoutes from "./mf/identityDocument.routes.js";
import mfEsignRoutes from "./mf/esign.routes.js";
import mfFileRoutes from "./mf/file.routes.js";
import mfRiskProfileRoutes from "./mf/riskProfile.routes.js";
import mfJourneyStatusRoutes from "./mf/journeyStatus.routes.js";
import mfInvestorProfileRoutes from "./mf/investorProfile.routes.js";
import mfPhoneNumberRoutes from "./mf/phoneNumber.routes.js";
import mfEmailAddressRoutes from "./mf/emailAddress.routes.js";
import mfAddressRoutes from "./mf/address.routes.js";
import mfRelatedPartyRoutes from "./mf/relatedParty.routes.js";
import mfBankAccountRoutes from "./mf/bankAccount.routes.js";
import mfInvestmentAccountRoutes from "./mf/mfInvestmentAccount.routes.js";
import mfAccountPrefillRoutes from "./mf/accountPrefill.routes.js";
import mfAmcRoutes from "./mf/master/amc.routes.js";
import mfSchemePlanRoutes from "./mf/master/schemePlan.routes.js";
import mfPurchaseRoutes from "./mf/purchase/mfPurchase.routes.js";
import mfBasketRoutes from "./mf/mfBasket.routes.js";

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
router.use("/api/mf/master/amcs", mfAmcRoutes);
router.use("/api/mf/master/scheme-plans", mfSchemePlanRoutes);

// MF Basket (fund listing for frontend)
router.use("/api/mf/basket", mfBasketRoutes);

// MF Transactions
router.use("/api/mf/purchase", mfPurchaseRoutes);

export default router;
