/**
 * Phone prepaid balance — the `phone_cents` wallet (W3-B; was
 * phone_balances + phone_balance_transactions). Responses keep the
 * pre-merge shapes the phone settings UI reads.
 */
import { getDb } from "../../db/index.js";
import { PHONE_WALLET_AUTO_TOP_UP_DEFAULTS } from "../../../../shared/wallets.js";
import { userWallet, WalletRepository, type WalletInit } from "../../repositories/walletRepository.js";
import { phoneBalanceTransactionView, phoneBalanceView } from "../../repositories/walletViews.js";

const PHONE = "phone_cents" as const;

const DEFAULT_INIT: WalletInit = {
  autoTopUpEnabled: PHONE_WALLET_AUTO_TOP_UP_DEFAULTS.enabled,
  autoTopUpThreshold: PHONE_WALLET_AUTO_TOP_UP_DEFAULTS.thresholdCents,
  autoTopUpAmount: PHONE_WALLET_AUTO_TOP_UP_DEFAULTS.amountCents,
};

/** The user's phone balance, provisioned at $0 on first read. */
export async function getPhoneBalance(userId: string) {
  const wallet = await new WalletRepository(getDb()).ensure(userWallet(userId), PHONE, DEFAULT_INIT);
  return phoneBalanceView(wallet);
}

/** Latest balance movements, newest first. */
export async function listPhoneBalanceTransactions(userId: string, limit = 50) {
  const rows = await new WalletRepository(getDb()).listLedger({ owner: userWallet(userId), currency: PHONE, limit });
  return rows.map(phoneBalanceTransactionView);
}

export async function setPhoneAutoTopUp(
  userId: string,
  config: { enabled: boolean; thresholdCents: number; amountCents: number },
) {
  const repo = new WalletRepository(getDb());
  await repo.ensure(userWallet(userId), PHONE, DEFAULT_INIT);
  const wallet = await repo.updateState(userWallet(userId), PHONE, {
    autoTopUpEnabled: config.enabled,
    autoTopUpThreshold: config.thresholdCents,
    autoTopUpAmount: config.amountCents,
  });
  return phoneBalanceView(wallet);
}
