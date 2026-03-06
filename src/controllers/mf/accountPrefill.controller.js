import KycRequest from "../../models/mf/kycRequest.model.js";
import IdentityDocument from "../../models/mf/identityDocument.model.js";
import MfUserData from "../../models/mf/mfUserData.model.js";

/*
 * Maps KYC request occupation_type values → investor profile occupation values
 * KYC:     private_sector, public_sector, government_sector, housewife
 * Profile: private_sector_service, public_sector_service, government_service, house_wife
 */
const OCCUPATION_MAP = {
  private_sector:    "private_sector_service",
  public_sector:     "public_sector_service",
  government_sector: "government_service",
  housewife:         "house_wife",
  // pass-through (same value in both)
  business:          "business",
  professional:      "professional",
  retired:           "retired",
  student:           "student",
  others:            "others",
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/account/prefill                                         */
/*  Returns:                                                            */
/*   - completion status for each account setup section                 */
/*   - pre-filled values from KYC request (if completed) + Aadhaar     */
/*  Frontend uses this to skip already-done steps and auto-fill forms.  */
/* ------------------------------------------------------------------ */
export const getAccountPrefill = async (req, res) => {
  try {
    const { uniqueId } = req.user;

    /* ---------- FETCH IN PARALLEL ---------- */
    const [mfData, kycRequest] = await Promise.all([
      MfUserData.findOne({ uniqueId }),
      // Latest successful or submitted KYC request (has the richest user data)
      KycRequest.findOne({
        uniqueId,
        status: { $in: ["successful", "submitted"] },
      }).sort({ createdAt: -1 }),
    ]);

    // Fetch Aadhaar identity document if KYC request exists
    let identityDoc = null;
    if (kycRequest?.fpKycRequestId) {
      identityDoc = await IdentityDocument.findOne({
        fpKycRequestId: kycRequest.fpKycRequestId,
        fetchStatus: "successful",
      });
    }

    /* ---------- SECTION COMPLETION FLAGS ---------- */
    const completed = {
      investorProfile:   !!mfData?.investorProfile?.fpInvestorProfileId,
      phoneNumber:       !!mfData?.phone?.fpPhoneNumberId,
      emailAddress:      !!mfData?.email?.fpEmailAddressId,
      address:           !!mfData?.address?.fpAddressId,
      bankAccount:       !!mfData?.bankAccount?.fpBankAccountId,
      nominee:           !!mfData?.nominee?.fpRelatedPartyId,
      investmentAccount: !!mfData?.investmentAccount?.fpInvestmentAccountId,
    };

    /* ---------- BUILD PRE-FILL VALUES FROM KYC REQUEST ---------- */
    // Only provide suggestions for sections not yet completed
    let prefill = {};

    if (kycRequest) {
      const kyc = kycRequest;

      // Investor Profile fields
      if (!completed.investorProfile) {
        prefill.investorProfile = {
          name:            kyc.name           ?? null,
          pan:             kyc.pan            ?? null,
          dob:             kyc.dob            ?? null,  // YYYY-MM-DD
          gender:          kyc.rawResponse?.gender      ?? null,
          // Map KYC occupation_type → investor profile occupation
          occupation:      OCCUPATION_MAP[kyc.rawResponse?.occupation_type] ?? kyc.rawResponse?.occupation_type ?? null,
          income_slab:     kyc.rawResponse?.income_slab  ?? null,
          pep_details:     kyc.rawResponse?.pep_details  ?? null,
          // tax_status mapping
          tax_status:      kyc.rawResponse?.residential_status === "resident_individual"
                             ? "resident_individual"
                             : kyc.rawResponse?.residential_status ?? null,
          source_of_wealth: null, // not captured in KYC request — user must fill
        };
      }

      // Phone Number
      if (!completed.phoneNumber && kyc.rawResponse?.mobile) {
        prefill.phoneNumber = {
          isd:    kyc.rawResponse.mobile.isd?.replace("+", "") ?? "91",
          number: kyc.rawResponse.mobile.number ?? null,
        };
      }

      // Email Address
      if (!completed.emailAddress && kyc.email) {
        prefill.emailAddress = {
          email: kyc.email,
        };
      }

      // Address — from Aadhaar identity document
      if (!completed.address && identityDoc) {
        prefill.address = {
          line1:       identityDoc.addressLine1 ?? null,
          postal_code: identityDoc.pincode       ?? null,
          // city/state are auto-filled by FP from postal_code — no need to send
        };
      }
    }

    /* ---------- EXISTING DATA (for sections already done) ---------- */
    const existing = {};

    if (completed.investorProfile) {
      const ip = mfData.investorProfile;
      existing.investorProfile = {
        fpInvestorProfileId: ip.fpInvestorProfileId,
        name:       ip.name,
        pan:        ip.pan,
        gender:     ip.gender,
        occupation: ip.occupation,
      };
    }

    if (completed.phoneNumber) {
      existing.phoneNumber = {
        fpPhoneNumberId: mfData.phone.fpPhoneNumberId,
        isd:    mfData.phone.isd,
        number: mfData.phone.number,
      };
    }

    if (completed.emailAddress) {
      existing.emailAddress = {
        fpEmailAddressId: mfData.email.fpEmailAddressId,
        email: mfData.email.email,
      };
    }

    if (completed.address) {
      existing.address = {
        fpAddressId: mfData.address.fpAddressId,
        line1:       mfData.address.line1,
        city:        mfData.address.city,
        state:       mfData.address.state,
        postalCode:  mfData.address.postalCode,
      };
    }

    if (completed.bankAccount) {
      existing.bankAccount = {
        fpBankAccountId: mfData.bankAccount.fpBankAccountId,
        bankName:        mfData.bankAccount.bankName,
        accountNumber:   mfData.bankAccount.accountNumber,
        ifscCode:        mfData.bankAccount.ifscCode,
        type:            mfData.bankAccount.type,
      };
    }

    if (completed.nominee) {
      existing.nominees = [{
        fpRelatedPartyId: mfData.nominee.fpRelatedPartyId,
        name:             mfData.nominee.name,
        relationship:     mfData.nominee.relationship,
      }];
    }

    if (completed.investmentAccount) {
      existing.investmentAccount = {
        fpInvestmentAccountId: mfData.investmentAccount.fpInvestmentAccountId,
      };
    }

    /* ---------- DETERMINE NEXT INCOMPLETE STEP ---------- */
    let nextStep = null;
    if (!completed.investorProfile)        nextStep = "investor_profile";
    else if (!completed.phoneNumber)       nextStep = "phone_number";
    else if (!completed.emailAddress)      nextStep = "email_address";
    else if (!completed.address)           nextStep = "address";
    else if (!completed.bankAccount)       nextStep = "bank_account";
    else if (!completed.investmentAccount) nextStep = "investment_account";
    // nominee is optional — don't block on it

    const allDone = completed.investorProfile &&
                    completed.phoneNumber     &&
                    completed.emailAddress    &&
                    completed.address         &&
                    completed.bankAccount     &&
                    completed.investmentAccount;

    return res.status(200).json({
      success: true,
      allDone,
      nextStep,
      completed,
      prefill,    // suggested values for incomplete sections (from KYC data)
      existing,   // confirmed values for completed sections
      sourceHint: kycRequest
        ? "Values pre-filled from your KYC application"
        : "No prior KYC data found — all fields must be entered manually",
    });
  } catch (err) {
    console.error("❌ [ACCOUNT PREFILL] Error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to fetch account prefill data" });
  }
};
