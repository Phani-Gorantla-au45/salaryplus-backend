import SafegoldUser from "../../models/safegold/safegoldUser.model.js";
import { safegoldGet } from "./client.utils.js";

/**
 * Fetch balance from SafeGold and sync to our DB.
 * Call this after every transaction (buy, sell, SIP installment).
 *
 * @param {string} uniqueId  — our internal user id
 * @returns {object}  { goldBalance, sellableBalance, balanceSyncedAt }
 */
export const syncSafegoldBalance = async (uniqueId) => {
  const record = await SafegoldUser.findOne({ uniqueId });
  if (!record?.safegoldUserId) {
    throw new Error("User is not registered with SafeGold");
  }

  console.log(`[SAFEGOLD] Syncing balance for userId=${record.safegoldUserId}`);

  const sgData = await safegoldGet(`/v1/users/${record.safegoldUserId}`);

  // SafeGold returns { code: 1, message: "User with that ID is missing" } on failure
  if (sgData?.code === 1) {
    throw new Error(sgData.message ?? "SafeGold user not found");
  }

  const goldBalance     = Number(sgData.gold_balance)     ?? 0;
  const sellableBalance = Number(sgData.sellable_balance) ?? 0;
  const syncedAt        = new Date();

  await SafegoldUser.updateOne(
    { uniqueId },
    {
      $set: {
        goldBalance,
        sellableBalance,
        balanceSyncedAt: syncedAt,
        // Also refresh KYC flags in case they changed
        "kyc.identityRequired": sgData.kyc_requirement?.identity_required ?? false,
        "kyc.panRequired":      sgData.kyc_requirement?.pan_required      ?? false,
      },
    }
  );

  console.log(`[SAFEGOLD] Balance synced — gold=${goldBalance}g, sellable=${sellableBalance}g`);

  return { goldBalance, sellableBalance, balanceSyncedAt: syncedAt };
};
