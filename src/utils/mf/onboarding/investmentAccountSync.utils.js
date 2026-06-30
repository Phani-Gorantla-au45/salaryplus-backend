import MfUserData from "../../../models/mf/mfUserData.model.js";
import { updateFpMfInvestmentAccount } from "./mfInvestmentAccount.utils.js";

const accountFromFp = (fpData) => {
  const fd = fpData.folio_defaults ?? {};
  return {
    fpInvestmentAccountId:    fpData.id,
    fpInvestmentAccountOldId: fpData.old_id ?? null,
    primaryInvestorPan:       fpData.primary_investor_pan,
    holdingPattern:            fpData.holding_pattern,
    folioDefaults: {
      communication_email_address:           fd.communication_email_address           ?? null,
      communication_mobile_number:           fd.communication_mobile_number           ?? null,
      communication_address:                 fd.communication_address                 ?? null,
      payout_bank_account:                   fd.payout_bank_account                   ?? null,
      nominee1:                              fd.nominee1                              ?? null,
      nominee1_allocation_percentage:        fd.nominee1_allocation_percentage        ?? null,
      nominee1_identity_proof_type:          fd.nominee1_identity_proof_type          ?? null,
      nominee1_guardian_identity_proof_type: fd.nominee1_guardian_identity_proof_type ?? null,
      nominations_info_visibility:           fd.nominations_info_visibility           ?? null,
    },
    rawResponse: fpData,
  };
};

/**
 * Re-builds folio_defaults from the current MfUserData state (email, phone,
 * address, bank account, nominee) and pushes it to FP's investment account.
 *
 * Returns null (no-op) if the investor doesn't have an investment account
 * yet — that's normal during onboarding (the account-creation step picks up
 * whatever's in MfUserData at that point on its own). Callers that need to
 * know "did this actually take effect on FP" should check for null.
 */
export const syncFolioDefaultsToFp = async (uniqueId) => {
  const mfData = await MfUserData.findOne({ uniqueId });
  if (!mfData?.investmentAccount?.fpInvestmentAccountId) {
    return null;
  }

  const { phone, email, address, bankAccount, nominee } = mfData;

  const folio_defaults = {
    nominations_info_visibility: "show_all_nominee_names",
  };

  if (email?.fpEmailAddressId)
    folio_defaults.communication_email_address = email.fpEmailAddressId;

  if (phone?.fpPhoneNumberId)
    folio_defaults.communication_mobile_number = phone.fpPhoneNumberId;

  if (address?.fpAddressId)
    folio_defaults.communication_address = address.fpAddressId;

  if (bankAccount?.fpBankAccountId)
    folio_defaults.payout_bank_account = bankAccount.fpBankAccountId;

  if (nominee?.fpRelatedPartyId) {
    folio_defaults.nominee1                       = nominee.fpRelatedPartyId;
    folio_defaults.nominee1_allocation_percentage = 100;

    if (nominee.identityProofType) {
      folio_defaults.nominee1_identity_proof_type = nominee.identityProofType;
    }
    if (nominee.isMinor && nominee.guardianIdentityProofType) {
      folio_defaults.nominee1_guardian_identity_proof_type = nominee.guardianIdentityProofType;
    }
  }

  const fpData = await updateFpMfInvestmentAccount(
    mfData.investmentAccount.fpInvestmentAccountId,
    { folio_defaults }
  );

  const record = await MfUserData.findOneAndUpdate(
    { uniqueId },
    { $set: { investmentAccount: accountFromFp(fpData) } },
    { new: true }
  );

  return record.investmentAccount;
};
