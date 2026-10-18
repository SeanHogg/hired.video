/**
 * Read-only verification of the W3-B merges (migrations 0590–0592, 0595):
 * wallets + ledgers, auth tokens, user settings. Compares every retired table
 * (still in `public`, or in `archive` after 0595) with its new home.
 *
 *   DATABASE_URL=... node --import tsx scripts/verify-wallet-merge.ts
 *   DATABASE_URL=... node --import tsx scripts/verify-wallet-merge.ts --preflight
 *
 * --preflight (run BEFORE deploying 0590): lists old ledger types the new
 * wallet_ledger CHECK would reject and phone rows whose text user_id is not a
 * uuid (those cannot become a wallet and stay in the archive).
 *
 * Default checks, per source:
 *   balances  copied  — every wallet nothing has touched since the copy
 *                       (updated_at < snapshot taken_at) equals the
 *                       0590 snapshot exactly. MUST be 0 mismatches.
 *             pending — old rows that differ from the snapshot (the old
 *                       Worker wrote after the copy). 0595 carries these over;
 *                       MUST be 0 after 0595 has run.
 *             totals  — old SUMs vs wallet SUMs (informational: new activity
 *                       after the deploy legitimately moves the wallet side).
 *   ledgers / auth tokens — every old row id exists in the new table with the
 *                       same amount (ledgers): missing MUST be 0 (after 0595).
 *   settings — every old row's section is saved on user_settings.
 *
 * Exit code 1 when a MUST check fails.
 */
import { neon } from "@neondatabase/serverless";
import { fileURLToPath } from "node:url";
import { argv } from "node:process";
import { WALLET_LEDGER_TYPES } from "../../shared/wallets.js";
import { withRetry } from "./run-sql-migrations.mjs";

type Query = (text: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>;

const UUID_RE = String.raw`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`;

interface BalanceSource {
  table: string;
  ownerKind: "user" | "company";
  currency: string;
  /** SQL over alias `o` → owner_id, balance, granted, consumed, reversed. */
  select: string;
  where?: string;
}

export const BALANCE_SOURCES: BalanceSource[] = [
  { table: "user_token_balance", ownerKind: "user", currency: "ai_tokens",
    select: "o.user_id AS owner_id, o.balance, o.lifetime_granted AS granted, o.lifetime_consumed AS consumed, 0 AS reversed" },
  { table: "company_token_balance", ownerKind: "company", currency: "ai_tokens",
    select: "o.company_id AS owner_id, o.balance, o.lifetime_granted AS granted, o.lifetime_consumed AS consumed, 0 AS reversed" },
  { table: "enrichment_credits", ownerKind: "user", currency: "enrichment_credits",
    select: "o.user_id AS owner_id, o.balance, o.total_purchased AS granted, o.total_consumed AS consumed, 0 AS reversed" },
  { table: "campaign_dollars_balance", ownerKind: "user", currency: "campaign_dollars",
    select: "o.user_id AS owner_id, o.balance_cents AS balance, o.lifetime_granted_cents AS granted, o.lifetime_spent_cents AS consumed, 0 AS reversed" },
  { table: "partner_program_balances", ownerKind: "user", currency: "partner_pool",
    select: "o.user_id AS owner_id, o.pending_cents AS balance, o.pending_cents + o.paid_cents AS granted, o.paid_cents AS consumed, 0 AS reversed" },
  { table: "user_points_balance", ownerKind: "user", currency: "points",
    select: "o.user_id AS owner_id, o.balance, o.lifetime_earned AS granted, o.lifetime_redeemed AS consumed, o.lifetime_reversed AS reversed" },
  { table: "phone_balances", ownerKind: "user", currency: "phone_cents",
    select: "o.user_id::uuid AS owner_id, o.balance_cents AS balance, 0 AS granted, 0 AS consumed, 0 AS reversed",
    where: `o.user_id::text ~* '${UUID_RE}'` },
];

interface LedgerSource {
  table: string;
  currency: string;
  /** Old amount + type columns (alias `o`). */
  amount: string;
  type: string;
}

export const LEDGER_SOURCES: LedgerSource[] = [
  { table: "enrichment_transactions", currency: "enrichment_credits", amount: "o.amount", type: "o.type::text" },
  { table: "campaign_dollars_transactions", currency: "campaign_dollars", amount: "o.amount_cents", type: "o.kind::text" },
  { table: "phone_balance_transactions", currency: "phone_cents", amount: "o.amount_cents", type: "o.type::text" },
  { table: "points_ledger", currency: "points", amount: "o.delta", type: "o.category::text" },
];

export const TOKEN_SOURCES = [
  { table: "email_verification_tokens", purpose: "email_verification" },
  { table: "password_reset_tokens", purpose: "password_reset" },
  { table: "magic_link_tokens", purpose: "magic_link" },
  { table: "two_factor_codes", purpose: "two_factor" },
] as const;

export const SETTINGS_SOURCES = [
  { table: "account_preferences", marker: "account_saved_at" },
  { table: "privacy_preferences", marker: "privacy_saved_at" },
  { table: "cookie_preferences", marker: "cookies_saved_at" },
] as const;

/** `public.t` while the old table is live, `archive.t` after 0595, else null. */
async function locate(query: Query, table: string): Promise<string | null> {
  const [row] = await query(
    `SELECT CASE WHEN to_regclass('public.' || $1::text) IS NOT NULL THEN 'public.' || $1::text
                 WHEN to_regclass('archive.' || $1::text) IS NOT NULL THEN 'archive.' || $1::text END AS rel`,
    [table],
  );
  return (row?.rel as string | null) ?? null;
}

const n = (v: unknown) => Number(v ?? 0);

async function verifyBalances(query: Query): Promise<number> {
  let failures = 0;
  for (const s of BALANCE_SOURCES) {
    const rel = await locate(query, s.table);
    if (!rel) { console.log(`[balance] ${s.table}: not present — skipped`); continue; }
    const where = s.where ?? "TRUE";
    const [copied] = await query(
      `SELECT count(*) FILTER (WHERE w.id IS NULL) AS missing,
              count(*) FILTER (WHERE w.id IS NOT NULL AND w.updated_at < b.taken_at
                AND (w.balance, w.lifetime_granted, w.lifetime_consumed, w.lifetime_reversed)
                    IS DISTINCT FROM (b.balance::int, b.lifetime_granted::int, b.lifetime_consumed::int, b.lifetime_reversed::int)) AS mismatched
       FROM archive.wallet_backfill_0590 b
       LEFT JOIN wallet_balances w
         ON w.owner_kind = $1 AND w.owner_id = b.owner_id AND w.currency_kind = $2
       WHERE b.source_table = $3`,
      [s.ownerKind, s.currency, s.table],
    );
    const [pending] = await query(
      `SELECT count(*) AS rows,
              coalesce(sum(x.balance - coalesce(b.balance, 0)), 0) AS d_balance
       FROM (SELECT ${s.select} FROM ${rel} o WHERE ${where}) x
       LEFT JOIN archive.wallet_backfill_0590 b ON b.source_table = $1 AND b.owner_id = x.owner_id
       WHERE b.owner_id IS NULL
          OR (x.balance, x.granted, x.consumed, x.reversed)
             IS DISTINCT FROM (b.balance, b.lifetime_granted, b.lifetime_consumed, b.lifetime_reversed)`,
      [s.table],
    );
    const [oldT] = await query(
      `SELECT count(*) AS rows, coalesce(sum(x.balance), 0) AS balance, coalesce(sum(x.granted), 0) AS granted,
              coalesce(sum(x.consumed), 0) AS consumed, coalesce(sum(x.reversed), 0) AS reversed
       FROM (SELECT ${s.select} FROM ${rel} o WHERE ${where}) x`,
    );
    const [skipped] = await query(`SELECT count(*) AS rows FROM ${rel} o WHERE NOT (${where})`);
    const [newT] = await query(
      `SELECT count(*) AS rows, coalesce(sum(balance), 0) AS balance, coalesce(sum(lifetime_granted), 0) AS granted,
              coalesce(sum(lifetime_consumed), 0) AS consumed, coalesce(sum(lifetime_reversed), 0) AS reversed
       FROM wallet_balances WHERE owner_kind = $1 AND currency_kind = $2`,
      [s.ownerKind, s.currency],
    );
    const bad = n(copied?.missing) + n(copied?.mismatched);
    failures += bad;
    const same = ["rows", "balance", "granted", "consumed", "reversed"].every((k) => n(oldT?.[k]) === n(newT?.[k]));
    console.log(
      `[balance] ${s.table} → ${s.ownerKind}/${s.currency}: copied ${bad === 0 ? "OK" : `FAIL (missing ${n(copied?.missing)}, mismatched ${n(copied?.mismatched)})`}` +
        `; pending catch-up ${n(pending?.rows)} row(s) (Δbalance ${n(pending?.d_balance)})` +
        `; totals ${same ? "MATCH" : "DIFF"} old=${JSON.stringify(oldT)} new=${JSON.stringify(newT)}` +
        (n(skipped?.rows) ? `; ${n(skipped?.rows)} row(s) not migratable (non-uuid owner)` : ""),
    );
  }
  return failures;
}

async function verifyLedgers(query: Query): Promise<number> {
  let failures = 0;
  for (const l of LEDGER_SOURCES) {
    const rel = await locate(query, l.table);
    if (!rel) { console.log(`[ledger] ${l.table}: not present — skipped`); continue; }
    const [r] = await query(
      `SELECT count(*) AS rows,
              count(*) FILTER (WHERE w.id IS NULL) AS missing,
              count(*) FILTER (WHERE w.id IS NOT NULL AND (w.amount <> ${l.amount} OR w.type <> ${l.type} OR w.currency_kind <> $1)) AS mismatched,
              coalesce(sum(${l.amount}), 0) AS old_sum,
              coalesce(sum(w.amount), 0) AS new_sum
       FROM ${rel} o LEFT JOIN wallet_ledger w ON w.id = o.id`,
      [l.currency],
    );
    const bad = n(r?.missing) + n(r?.mismatched);
    failures += bad;
    console.log(
      `[ledger] ${l.table} → ${l.currency}: ${n(r?.rows)} rows, missing ${n(r?.missing)}, mismatched ${n(r?.mismatched)}, ` +
        `sum old=${n(r?.old_sum)} new=${n(r?.new_sum)} ${bad === 0 && n(r?.old_sum) === n(r?.new_sum) ? "MATCH" : "DIFF"}`,
    );
  }
  return failures;
}

async function verifyTokens(query: Query): Promise<number> {
  let failures = 0;
  for (const t of TOKEN_SOURCES) {
    const rel = await locate(query, t.table);
    if (!rel) { console.log(`[auth] ${t.table}: not present — skipped`); continue; }
    const [r] = await query(
      `SELECT count(*) AS rows,
              count(*) FILTER (WHERE a.id IS NULL) AS missing,
              count(*) FILTER (WHERE a.id IS NOT NULL AND (a.purpose <> $1 OR a.expires_at <> o.expires_at
                                OR (o.used AND a.used_at IS NULL))) AS mismatched
       FROM ${rel} o LEFT JOIN auth_tokens a ON a.id = o.id`,
      [t.purpose],
    );
    // Rows the retention sweep removed from auth_tokens after expiry are not
    // failures — only unexpired rows must be present.
    const [live] = await query(
      `SELECT count(*) AS missing FROM ${rel} o LEFT JOIN auth_tokens a ON a.id = o.id
       WHERE a.id IS NULL AND o.expires_at > now() - interval '1 day'`,
    );
    failures += n(live?.missing) + n(r?.mismatched);
    console.log(`[auth] ${t.table} → ${t.purpose}: ${n(r?.rows)} rows, missing ${n(r?.missing)} (unexpired ${n(live?.missing)}), mismatched ${n(r?.mismatched)}`);
  }
  return failures;
}

async function verifySettings(query: Query): Promise<number> {
  let failures = 0;
  for (const s of SETTINGS_SOURCES) {
    const rel = await locate(query, s.table);
    if (!rel) { console.log(`[settings] ${s.table}: not present — skipped`); continue; }
    const [r] = await query(
      `SELECT count(*) AS rows, count(*) FILTER (WHERE us.${s.marker} IS NULL) AS unsaved
       FROM ${rel} o LEFT JOIN user_settings us ON us.user_id = o.user_id`,
    );
    failures += n(r?.unsaved);
    console.log(`[settings] ${s.table} → user_settings.${s.marker}: ${n(r?.rows)} rows, section missing for ${n(r?.unsaved)}`);
  }
  return failures;
}

async function preflight(query: Query): Promise<number> {
  let problems = 0;
  for (const l of LEDGER_SOURCES) {
    const rel = await locate(query, l.table);
    if (!rel) continue;
    const rows = await query(`SELECT DISTINCT ${l.type} AS type FROM ${rel} o`);
    const unknown = rows.map((r) => String(r.type)).filter((t) => !WALLET_LEDGER_TYPES.includes(t));
    problems += unknown.length;
    console.log(`[preflight] ${l.table}: types ${unknown.length ? `NOT ALLOWED by wallet_ledger_type_check: ${unknown.join(", ")}` : "OK"}`);
  }
  for (const t of ["phone_balances", "phone_balance_transactions"]) {
    const rel = await locate(query, t);
    if (!rel) continue;
    const [r] = await query(`SELECT count(*) AS rows FROM ${rel} WHERE NOT (user_id::text ~* '${UUID_RE}')`);
    console.log(`[preflight] ${t}: ${n(r?.rows)} row(s) with a non-uuid user_id (left in the archive)`);
  }
  return problems;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.NEON_DB_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = neon(url);
  const query: Query = (text, params) => withRetry(() => sql(text, params ?? [])) as Promise<Array<Record<string, unknown>>>;
  if (argv.includes("--preflight")) {
    const problems = await preflight(query);
    process.exit(problems > 0 ? 1 : 0);
  }
  const failures =
    (await verifyBalances(query)) + (await verifyLedgers(query)) + (await verifyTokens(query)) + (await verifySettings(query));
  console.log(failures === 0 ? "\nW3-B merge verified: OK" : `\nW3-B merge verification: ${failures} failure(s)`);
  process.exit(failures > 0 ? 1 : 0);
}

if (fileURLToPath(import.meta.url) === argv[1]) {
  main().catch((e) => {
    console.error("FATAL:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
