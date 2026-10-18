/**
 * WalletRepository — the ONE module that reads or writes `wallet_balances`
 * and `wallet_ledger` (W3-B, migrations 0590 + 0595).
 *
 * Every stored-value surface goes through here: AI-token packs (user and
 * company pools, via TokensRepository / company-token-ledger), enrichment
 * credits, Campaign $, the Partner Program pool, gamification points (via
 * PointsRepository) and the phone balance. Domain rules (which bucket to
 * debit, award caps, fraud) stay in the domain modules; this file only
 * guarantees the arithmetic + atomicity:
 *
 *   • `applyDelta`      — one upsert that moves balance + lifetime counters.
 *   • `postEntry`       — balance move AND its ledger row in ONE statement
 *                         (data-modifying CTE), optionally conditional on a
 *                         sufficient balance and/or idempotent on the
 *                         ledger reference.
 *   • `creditFromSelectSql` — the same credit as a SQL fragment, for callers
 *                         that must commit it together with their own rows
 *                         (token-pack settle, partner period accrual).
 *
 * Row → legacy API shape mapping lives in walletViews.ts.
 */

import { and, desc, eq, gte, inArray, sql, type SQL } from "drizzle-orm";
import { schema } from "../db/index.js";
import type { WalletCurrencyKind, WalletOwnerKind } from "../../../shared/wallets.js";
import {
  rowsOf,
  type DbLike,
  type LedgerEntryInput,
  type LedgerFilter,
  type WalletDelta,
  type WalletInit,
  type WalletLedgerInsert,
  type WalletLedgerRow,
  type WalletOwner,
  type WalletRow,
} from "./walletTypes.js";

export * from "./walletTypes.js";

const { walletBalances, walletLedger } = schema;

export class WalletRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  private ownerWhere(owner: WalletOwner, currency: WalletCurrencyKind) {
    return and(
      eq(walletBalances.ownerKind, owner.kind),
      eq(walletBalances.ownerId, owner.id),
      eq(walletBalances.currencyKind, currency),
    );
  }

  // ── balances: reads ─────────────────────────────────────────────────────

  async find(owner: WalletOwner, currency: WalletCurrencyKind): Promise<WalletRow | null> {
    const [row] = await this.db.select().from(walletBalances).where(this.ownerWhere(owner, currency)).limit(1);
    return (row as WalletRow) ?? null;
  }

  async findMany(ownerKind: WalletOwnerKind, ownerIds: string[], currency: WalletCurrencyKind): Promise<WalletRow[]> {
    if (ownerIds.length === 0) return [];
    return (await this.db
      .select()
      .from(walletBalances)
      .where(and(
        eq(walletBalances.ownerKind, ownerKind),
        inArray(walletBalances.ownerId, ownerIds),
        eq(walletBalances.currencyKind, currency),
      ))) as WalletRow[];
  }

  /** Get-or-create (zero balance) — for surfaces that always show a row. */
  async ensure(owner: WalletOwner, currency: WalletCurrencyKind, init: WalletInit = {}): Promise<WalletRow> {
    const existing = await this.find(owner, currency);
    if (existing) return existing;
    await this.db
      .insert(walletBalances)
      .values({ ownerKind: owner.kind, ownerId: owner.id, currencyKind: currency, ...init })
      .onConflictDoNothing();
    return (await this.find(owner, currency)) as WalletRow;
  }

  // ── balances: writes ────────────────────────────────────────────────────

  /** Move balance + lifetime counters in one upsert; returns the row after. */
  async applyDelta(owner: WalletOwner, currency: WalletCurrencyKind, d: WalletDelta): Promise<WalletRow | null> {
    const granted = d.grantedAdd ?? 0;
    const consumed = d.consumedAdd ?? 0;
    const reversed = d.reversedAdd ?? 0;
    const next = d.clampAtZero
      ? sql`GREATEST(${walletBalances.balance} + ${d.delta}, 0)`
      : sql`${walletBalances.balance} + ${d.delta}`;
    const set = {
      balance: next,
      lifetimeGranted: sql`${walletBalances.lifetimeGranted} + ${granted}`,
      lifetimeConsumed: sql`${walletBalances.lifetimeConsumed} + ${consumed}`,
      lifetimeReversed: sql`${walletBalances.lifetimeReversed} + ${reversed}`,
      updatedAt: this.now(),
    };
    if (d.createIfMissing === false) {
      const [row] = await this.db.update(walletBalances).set(set).where(this.ownerWhere(owner, currency)).returning();
      return (row as WalletRow) ?? null;
    }
    const [row] = await this.db
      .insert(walletBalances)
      .values({
        ownerKind: owner.kind,
        ownerId: owner.id,
        currencyKind: currency,
        ...d.init,
        balance: d.clampAtZero ? Math.max(d.delta, 0) : d.delta,
        lifetimeGranted: granted,
        lifetimeConsumed: consumed,
        lifetimeReversed: reversed,
      })
      .onConflictDoUpdate({
        target: [walletBalances.ownerKind, walletBalances.ownerId, walletBalances.currencyKind],
        set,
      })
      .returning();
    return (row as WalletRow) ?? null;
  }

  /** Set the non-arithmetic columns of a wallet (creating it if missing). */
  async updateState(
    owner: WalletOwner,
    currency: WalletCurrencyKind,
    patch: WalletInit & Partial<Pick<WalletRow, "isSuspended" | "suspendedAt" | "suspendedReason" | "suspendedBy">>,
  ): Promise<WalletRow> {
    const [row] = await this.db
      .insert(walletBalances)
      .values({ ownerKind: owner.kind, ownerId: owner.id, currencyKind: currency, ...patch })
      .onConflictDoUpdate({
        target: [walletBalances.ownerKind, walletBalances.ownerId, walletBalances.currencyKind],
        set: { ...patch, updatedAt: this.now() },
      })
      .returning();
    return row as WalletRow;
  }

  /**
   * Move the balance AND append its ledger row in ONE statement. The ledger
   * `amount` is `delta`, `balance_after` the post-move balance.
   *
   *   requireSufficient — debit only when balance >= -delta (no row → no-op).
   *   idempotent        — no-op when this currency already has a ledger row
   *                       with the same (reference_type, reference_id).
   *
   * Returns the balance after, or null when nothing was posted.
   */
  async postEntry(args: {
    owner: WalletOwner;
    currency: WalletCurrencyKind;
    delta: number;
    grantedAdd?: number;
    consumedAdd?: number;
    entry: LedgerEntryInput;
    requireSufficient?: boolean;
    idempotent?: boolean;
    init?: WalletInit;
  }): Promise<number | null> {
    const { owner, currency, delta, entry } = args;
    const granted = args.grantedAdd ?? 0;
    const consumed = args.consumedAdd ?? 0;
    const now = this.now();
    const notPosted = args.idempotent
      ? sql`NOT EXISTS (SELECT 1 FROM wallet_ledger l WHERE l.currency_kind = ${currency}::varchar
          AND l.reference_type = ${entry.referenceType ?? null}::varchar AND l.reference_id = ${entry.referenceId ?? null}::text)`
      : sql`TRUE`;
    const init = args.init ?? {};
    const move = args.requireSufficient
      ? sql`UPDATE wallet_balances SET
            balance = balance + ${delta}::int,
            lifetime_granted = lifetime_granted + ${granted}::int,
            lifetime_consumed = lifetime_consumed + ${consumed}::int,
            updated_at = ${now}::timestamptz
          WHERE owner_kind = ${owner.kind}::varchar AND owner_id = ${owner.id}::uuid AND currency_kind = ${currency}::varchar
            AND balance >= ${-delta}::int AND ${notPosted}
          RETURNING balance`
      : sql`INSERT INTO wallet_balances
            (owner_kind, owner_id, currency_kind, balance, lifetime_granted, lifetime_consumed,
             auto_top_up_enabled, auto_top_up_threshold, auto_top_up_amount)
          SELECT ${owner.kind}::varchar, ${owner.id}::uuid, ${currency}::varchar, ${delta}::int, ${granted}::int, ${consumed}::int,
                 ${init.autoTopUpEnabled ?? null}::boolean, ${init.autoTopUpThreshold ?? null}::int, ${init.autoTopUpAmount ?? null}::int
          WHERE ${notPosted}
          ON CONFLICT (owner_kind, owner_id, currency_kind) DO UPDATE SET
            balance = wallet_balances.balance + EXCLUDED.balance,
            lifetime_granted = wallet_balances.lifetime_granted + EXCLUDED.lifetime_granted,
            lifetime_consumed = wallet_balances.lifetime_consumed + EXCLUDED.lifetime_consumed,
            updated_at = ${now}::timestamptz
          RETURNING balance`;
    const result = await this.db.execute(sql`
      WITH moved AS (${move}),
      entry AS (
        INSERT INTO wallet_ledger
          (owner_kind, owner_id, currency_kind, type, amount, balance_after, reference_type, reference_id, description, created_at)
        SELECT ${owner.kind}::varchar, ${owner.id}::uuid, ${currency}::varchar, ${entry.type}::varchar, ${delta}::int, moved.balance,
               ${entry.referenceType ?? null}::varchar, ${entry.referenceId ?? null}::text, ${entry.description ?? null}::text, ${now}::timestamptz
        FROM moved
        RETURNING balance_after
      )
      SELECT balance_after FROM entry
    `);
    const [row] = rowsOf<{ balance_after: number | string }>(result);
    return row ? Number(row.balance_after) : null;
  }

  /**
   * SQL fragment: credit each row of `source` (a SELECT yielding `owner_id`
   * and `amount`) — balance and lifetime_granted both += amount. RETURNING
   * owner_id, balance. Compose it into the caller's data-modifying CTE so the
   * credit commits with the caller's own rows.
   */
  creditFromSelectSql(args: {
    ownerKind: WalletOwnerKind;
    currency: WalletCurrencyKind;
    source: SQL;
    lastPeriodId?: string | null;
  }): SQL {
    return sql`
      INSERT INTO wallet_balances (owner_kind, owner_id, currency_kind, balance, lifetime_granted, last_period_id)
      SELECT ${args.ownerKind}::varchar, src.owner_id, ${args.currency}::varchar, src.amount, src.amount, ${args.lastPeriodId ?? null}::uuid
      FROM (${args.source}) AS src
      ON CONFLICT (owner_kind, owner_id, currency_kind) DO UPDATE SET
        balance = wallet_balances.balance + EXCLUDED.balance,
        lifetime_granted = wallet_balances.lifetime_granted + EXCLUDED.lifetime_granted,
        last_period_id = COALESCE(EXCLUDED.last_period_id, wallet_balances.last_period_id),
        updated_at = ${this.now()}::timestamptz
      RETURNING owner_id, balance`;
  }

  async execute(statement: SQL): Promise<unknown[]> {
    return rowsOf(await this.db.execute(statement));
  }

  // ── balances: aggregates (one currency) ─────────────────────────────────

  async totals(currency: WalletCurrencyKind) {
    const [row] = await this.db
      .select({
        wallets: sql<number>`count(*)::int`,
        suspended: sql<number>`coalesce(sum(case when ${walletBalances.isSuspended} then 1 else 0 end), 0)::int`,
        granted: sql<number>`coalesce(sum(${walletBalances.lifetimeGranted}), 0)::int`,
        consumed: sql<number>`coalesce(sum(${walletBalances.lifetimeConsumed}), 0)::int`,
        balance: sql<number>`coalesce(sum(${walletBalances.balance}), 0)::int`,
      })
      .from(walletBalances)
      .where(and(eq(walletBalances.ownerKind, "user"), eq(walletBalances.currencyKind, currency)));
    return {
      wallets: Number(row?.wallets ?? 0),
      suspended: Number(row?.suspended ?? 0),
      granted: Number(row?.granted ?? 0),
      consumed: Number(row?.consumed ?? 0),
      balance: Number(row?.balance ?? 0),
    };
  }

  /** User wallets of a currency, highest lifetime_granted first. */
  async topByLifetimeGranted(
    currency: WalletCurrencyKind,
    limit: number,
    opts: { excludeSuspended?: boolean; ownerIds?: string[] } = {},
  ): Promise<WalletRow[]> {
    return (await this.db
      .select()
      .from(walletBalances)
      .where(and(...this.userCurrencyConds(currency, opts)))
      .orderBy(desc(walletBalances.lifetimeGranted))
      .limit(limit)) as WalletRow[];
  }

  async countAboveLifetimeGranted(
    currency: WalletCurrencyKind,
    threshold: number,
    opts: { excludeSuspended?: boolean; ownerIds?: string[] } = {},
  ): Promise<number> {
    const [row] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(walletBalances)
      .where(and(...this.userCurrencyConds(currency, opts), sql`${walletBalances.lifetimeGranted} > ${threshold}`));
    return Number((row as { c?: number } | undefined)?.c ?? 0);
  }

  /** User ids holding a balance or with any lifetime spend, up to `limit`. */
  async listActiveOwnerIds(currency: WalletCurrencyKind, limit: number): Promise<string[]> {
    const rows = await this.db
      .select({ ownerId: walletBalances.ownerId })
      .from(walletBalances)
      .where(and(
        ...this.userCurrencyConds(currency, {}),
        sql`(${walletBalances.balance} > 0 OR ${walletBalances.lifetimeConsumed} > 0)`,
      ))
      .limit(limit);
    return (rows as Array<{ ownerId: string }>).map((r) => r.ownerId);
  }

  private userCurrencyConds(currency: WalletCurrencyKind, opts: { excludeSuspended?: boolean; ownerIds?: string[] }) {
    const conds = [eq(walletBalances.ownerKind, "user"), eq(walletBalances.currencyKind, currency)];
    if (opts.excludeSuspended) conds.push(eq(walletBalances.isSuspended, false));
    if (opts.ownerIds && opts.ownerIds.length > 0) conds.push(inArray(walletBalances.ownerId, opts.ownerIds));
    return conds;
  }

  // ── ledger ──────────────────────────────────────────────────────────────

  async insertLedger(input: WalletLedgerInsert): Promise<WalletLedgerRow> {
    const [row] = await this.db.insert(walletLedger).values(input).returning();
    return row as WalletLedgerRow;
  }

  /** Insert unless a unique index (points dedup) already holds the row. */
  async insertLedgerIdempotent(input: WalletLedgerInsert): Promise<WalletLedgerRow | null> {
    const [row] = await this.db.insert(walletLedger).values(input).onConflictDoNothing().returning();
    return (row as WalletLedgerRow) ?? null;
  }

  private ledgerConds(f: LedgerFilter) {
    const conds = [
      eq(walletLedger.ownerKind, f.owner.kind),
      eq(walletLedger.ownerId, f.owner.id),
      eq(walletLedger.currencyKind, f.currency),
    ];
    if (f.type) conds.push(eq(walletLedger.type, f.type));
    if (f.action) conds.push(eq(walletLedger.action, f.action));
    if (f.since) conds.push(gte(walletLedger.createdAt, f.since));
    return conds;
  }

  /** The ledger row of a currency carrying this reference, if any. */
  async findLedgerByReference(
    currency: WalletCurrencyKind,
    referenceType: string,
    referenceId: string,
  ): Promise<WalletLedgerRow | null> {
    const [row] = await this.db
      .select()
      .from(walletLedger)
      .where(and(
        eq(walletLedger.currencyKind, currency),
        eq(walletLedger.referenceType, referenceType),
        eq(walletLedger.referenceId, referenceId),
      ))
      .limit(1);
    return (row as WalletLedgerRow) ?? null;
  }

  /** Newest first. */
  async listLedger(f: LedgerFilter & { limit: number }): Promise<WalletLedgerRow[]> {
    return (await this.db
      .select()
      .from(walletLedger)
      .where(and(...this.ledgerConds(f)))
      .orderBy(desc(walletLedger.createdAt))
      .limit(f.limit)) as WalletLedgerRow[];
  }

  async countLedger(f: LedgerFilter): Promise<number> {
    const [row] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(walletLedger)
      .where(and(...this.ledgerConds(f)));
    return Number(row?.c ?? 0);
  }

  async sumLedger(f: LedgerFilter): Promise<number> {
    const [row] = await this.db
      .select({ s: sql<number>`coalesce(sum(${walletLedger.amount}), 0)::int` })
      .from(walletLedger)
      .where(and(...this.ledgerConds(f)));
    return Number(row?.s ?? 0);
  }
}
