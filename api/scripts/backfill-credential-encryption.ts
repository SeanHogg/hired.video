/**
 * One-off backfill for the credential encryption rollout (migrations 0548 +
 * 0577).
 *
 * For every legacy plaintext credential column, encrypts each remaining value
 * into its `*_enc` sibling and NULLs the plaintext in the same UPDATE. Rows are
 * matched on (id, plaintext value) so a row rewritten concurrently by the app
 * is skipped rather than clobbered. Idempotent: re-running only touches rows
 * that still hold plaintext.
 *
 *   DATABASE_URL=... CREDENTIALS_KMS_KEY=... \
 *     node --import tsx scripts/backfill-credential-encryption.ts [--dry-run]
 *
 * CREDENTIALS_KMS_KEY MUST be the exact value the Worker has (a ciphertext
 * only decrypts under the key that wrote it). After this reports 0 remaining,
 * approve 0549_clear_plaintext_credentials.sql and
 * 0578_clear_plaintext_ats_webhook_secret.sql.
 */
import { neon } from "@neondatabase/serverless";
import { fileURLToPath } from "node:url";
import { argv } from "node:process";
import { sealCredential, CREDENTIALS_KEY_ENV } from "../src/services/crypto/credential-columns.js";
import { withRetry } from "./run-sql-migrations.mjs";

/** Every (table, plaintext column, encrypted column) pair from 0548 + 0577. */
export const CREDENTIAL_COLUMNS: ReadonlyArray<{ table: string; plain: string; enc: string }> = [
  { table: "ats_connections", plain: "api_key", enc: "api_key_enc" },
  { table: "ats_connections", plain: "webhook_secret", enc: "webhook_secret_enc" },
  { table: "calendar_connections", plain: "access_token", enc: "access_token_enc" },
  { table: "calendar_connections", plain: "refresh_token", enc: "refresh_token_enc" },
  { table: "lms_connectors", plain: "access_token", enc: "access_token_enc" },
  { table: "lms_connectors", plain: "refresh_token", enc: "refresh_token_enc" },
  { table: "oauth_accounts", plain: "access_token", enc: "access_token_enc" },
  { table: "oauth_accounts", plain: "refresh_token", enc: "refresh_token_enc" },
  { table: "youtube_accounts", plain: "access_token", enc: "access_token_enc" },
  { table: "youtube_accounts", plain: "refresh_token", enc: "refresh_token_enc" },
];

type Query = (text: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>;

const BATCH = 200;

export async function backfill(query: Query, masterKey: string, dryRun = false): Promise<Map<string, number>> {
  const migrated = new Map<string, number>();
  for (const { table, plain, enc } of CREDENTIAL_COLUMNS) {
    const label = `${table}.${plain}`;
    let total = 0;
    for (;;) {
      const rows = await query(
        `SELECT id, "${plain}" AS value FROM "${table}" WHERE "${plain}" IS NOT NULL AND "${plain}" <> '' ORDER BY id LIMIT ${BATCH}`,
      );
      if (rows.length === 0 || dryRun) {
        if (dryRun) total = rows.length;
        break;
      }
      for (const row of rows) {
        const sealed = await sealCredential(String(row.value), masterKey);
        await query(
          `UPDATE "${table}" SET "${enc}" = $1, "${plain}" = NULL WHERE id = $2 AND "${plain}" = $3`,
          [sealed.enc, row.id, row.value],
        );
        total++;
      }
    }
    migrated.set(label, total);
  }
  return migrated;
}

async function remaining(query: Query): Promise<number> {
  let n = 0;
  for (const { table, plain } of CREDENTIAL_COLUMNS) {
    const [row] = await query(`SELECT count(*)::int AS n FROM "${table}" WHERE "${plain}" IS NOT NULL AND "${plain}" <> ''`);
    n += Number(row?.n ?? 0);
  }
  return n;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.NEON_DB_URL;
  const masterKey = process.env[CREDENTIALS_KEY_ENV];
  if (!url) throw new Error("DATABASE_URL is not set");
  if (!masterKey) throw new Error(`${CREDENTIALS_KEY_ENV} is not set — use the exact value configured on the Worker`);
  const sql = neon(url);
  const query: Query = (text, params) => withRetry(() => sql(text, params ?? [])) as Promise<Array<Record<string, unknown>>>;
  const dryRun = argv.includes("--dry-run");

  const result = await backfill(query, masterKey, dryRun);
  for (const [label, n] of result) console.log(`${label}: ${n} ${dryRun ? "plaintext row(s) in the first batch" : "encrypted"}`);
  console.log(`remaining plaintext credentials: ${await remaining(query)}`);
}

if (fileURLToPath(import.meta.url) === argv[1]) {
  main().catch((e) => {
    console.error("FATAL:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
