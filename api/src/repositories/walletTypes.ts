/**
 * Wallet types + owner helpers shared by WalletRepository and walletViews
 * (W3-B). Kept apart so the repository stays a single-purpose module.
 */

import { schema } from "../db/index.js";
import type { WalletCurrencyKind, WalletOwnerKind } from "../../../shared/wallets.js";

const { walletBalances, walletLedger } = schema;

export type DbLike = any;

export type WalletRow = typeof walletBalances.$inferSelect;
export type WalletLedgerRow = typeof walletLedger.$inferSelect;
export type WalletLedgerInsert = typeof walletLedger.$inferInsert;

export interface WalletOwner {
  kind: WalletOwnerKind;
  id: string;
}

export const userWallet = (id: string): WalletOwner => ({ kind: "user", id });
export const companyWallet = (id: string): WalletOwner => ({ kind: "company", id });

/** Non-arithmetic columns a wallet row may be created with. */
export type WalletInit = Partial<
  Pick<
    WalletRow,
    "rateCentsPer1kPoints" | "lastPeriodId" | "autoTopUpEnabled" | "autoTopUpThreshold" | "autoTopUpAmount"
  >
>;

export interface WalletDelta {
  /** Signed change to `balance`. */
  delta: number;
  /** Clamp the resulting balance at 0 (pack debits, points). */
  clampAtZero?: boolean;
  grantedAdd?: number;
  consumedAdd?: number;
  reversedAdd?: number;
  /** Create the row when missing (default true). False = update-only. */
  createIfMissing?: boolean;
  init?: WalletInit;
}

export interface LedgerEntryInput {
  type: string;
  referenceType?: string | null;
  referenceId?: string | null;
  description?: string | null;
}

export interface LedgerFilter {
  owner: WalletOwner;
  currency: WalletCurrencyKind;
  type?: string;
  action?: string;
  since?: Date;
}

/** Rows of a `db.execute` result across drivers (neon-http → { rows }). */
export function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: T[] } | null)?.rows;
  return Array.isArray(rows) ? rows : [];
}
