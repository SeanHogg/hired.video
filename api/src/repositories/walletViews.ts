/**
 * Wallet row → legacy API shape. The wallet merge (W3-B) keeps every
 * response byte-compatible with the retired per-currency tables, so each
 * surface maps the one `wallet_balances` / `wallet_ledger` row back to the
 * field names its clients already read.
 */

import type { WalletLedgerRow, WalletRow } from "./walletTypes.js";

// ── balances ──────────────────────────────────────────────────────────────

/** Was `enrichment_credits`. */
export function enrichmentCreditsView(w: WalletRow) {
  return {
    id: w.id,
    userId: w.ownerId,
    balance: w.balance,
    totalPurchased: w.lifetimeGranted,
    totalConsumed: w.lifetimeConsumed,
    updatedAt: w.updatedAt,
  };
}

/** Was `campaign_dollars_balance`. */
export function campaignDollarsBalanceView(w: WalletRow) {
  return {
    id: w.id,
    userId: w.ownerId,
    balanceCents: w.balance,
    lifetimeGrantedCents: w.lifetimeGranted,
    lifetimeSpentCents: w.lifetimeConsumed,
    rateCentsPer1kPoints: w.rateCentsPer1kPoints ?? null,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  };
}

/** Was `partner_program_balances` (pending = balance, paid = consumed). */
export function partnerProgramBalanceView(w: WalletRow) {
  return {
    userId: w.ownerId,
    pendingCents: w.balance,
    paidCents: w.lifetimeConsumed,
    lastPeriodId: w.lastPeriodId ?? null,
    updatedAt: w.updatedAt,
  };
}

/** Was `phone_balances`. */
export function phoneBalanceView(w: WalletRow) {
  return {
    id: w.id,
    userId: w.ownerId,
    balanceCents: w.balance,
    autoTopUpEnabled: w.autoTopUpEnabled ?? false,
    autoTopUpThresholdCents: w.autoTopUpThreshold ?? 500,
    autoTopUpAmountCents: w.autoTopUpAmount ?? 2000,
    updatedAt: w.updatedAt,
  };
}

/** Was `user_points_balance` (earned = granted, redeemed = consumed). */
export interface PointsBalanceRow {
  id: string;
  userId: string;
  balance: number;
  lifetimeEarned: number;
  lifetimeRedeemed: number;
  lifetimeReversed: number;
  isSuspended: boolean;
  suspendedAt: Date | null;
  suspendedReason: string | null;
  suspendedBy: string | null;
  updatedAt: Date;
}

export function pointsBalanceView(w: WalletRow): PointsBalanceRow {
  return {
    id: w.id,
    userId: w.ownerId,
    balance: w.balance,
    lifetimeEarned: w.lifetimeGranted,
    lifetimeRedeemed: w.lifetimeConsumed,
    lifetimeReversed: w.lifetimeReversed,
    isSuspended: w.isSuspended,
    suspendedAt: w.suspendedAt ?? null,
    suspendedReason: w.suspendedReason ?? null,
    suspendedBy: w.suspendedBy ?? null,
    updatedAt: w.updatedAt,
  };
}

// ── ledgers ───────────────────────────────────────────────────────────────

/** Was `enrichment_transactions`. */
export function enrichmentTransactionView(e: WalletLedgerRow) {
  return {
    id: e.id,
    userId: e.ownerId,
    type: e.type,
    amount: e.amount,
    balanceAfter: e.balanceAfter ?? 0,
    description: e.description ?? null,
    referenceId: e.referenceId ?? null,
    createdAt: e.createdAt,
  };
}

/** Was `campaign_dollars_transactions`. */
export function campaignDollarsTransactionView(e: WalletLedgerRow) {
  return {
    id: e.id,
    userId: e.ownerId,
    kind: e.type,
    amountCents: e.amount,
    balanceAfterCents: e.balanceAfter ?? 0,
    referenceId: e.referenceId ?? null,
    referenceType: e.referenceType ?? null,
    description: e.description ?? null,
    createdAt: e.createdAt,
  };
}

/** Was `phone_balance_transactions`. */
export function phoneBalanceTransactionView(e: WalletLedgerRow) {
  return {
    id: e.id,
    userId: e.ownerId,
    type: e.type,
    amountCents: e.amount,
    balanceCentsAfter: e.balanceAfter ?? 0,
    description: e.description ?? null,
    referenceId: e.referenceId ?? null,
    createdAt: e.createdAt,
  };
}

/** Was `points_ledger` (delta = amount, category = type, ref = reference). */
export interface PointsLedgerRow {
  id: string;
  userId: string;
  delta: number;
  category: string;
  action: string;
  source: string;
  refId: string | null;
  refType: string | null;
  reversesId: string | null;
  metadata: unknown;
  createdAt: Date;
}

export function pointsLedgerView(e: WalletLedgerRow): PointsLedgerRow {
  return {
    id: e.id,
    userId: e.ownerId,
    delta: e.amount,
    category: e.type,
    action: e.action ?? "",
    source: e.source ?? "",
    refId: e.referenceId ?? null,
    refType: e.referenceType ?? null,
    reversesId: e.reversesId ?? null,
    metadata: e.metadata ?? null,
    createdAt: e.createdAt,
  };
}
