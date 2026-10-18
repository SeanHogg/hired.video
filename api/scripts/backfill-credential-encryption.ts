/**
 * One-off re-seal for the credential encryption rollout (0548 / 0577, then
 * the W3-C merge into provider_connections, 0600).
 *
 * Migration 0600 copied every legacy secret into provider_connections behind
 * a `legacy:<scheme>:` prefix (plaintext, or ciphertext under a pre-merge key
 * — see src/services/provider-connections/connection-secrets.ts). Reads
 * re-seal lazily; this script re-seals every remaining one under
 * CREDENTIALS_KMS_KEY. Each UPDATE is compare-and-set on (id, old value), so a
 * row rewritten concurrently by the app is skipped rather than clobbered.
 * Idempotent: re-running only touches values that are still legacy. A value
 * whose legacy key is missing (or that fails to decrypt) is reported and left
 * as is.
 *
 *   DATABASE_URL=... CREDENTIALS_KMS_KEY=... \
 *   PAID_MEDIA_KMS_KEY=... SOCIAL_KMS_KEY=... EXTERNAL_EMAIL_TOKEN_KEY=... \
 *   WORKFORCE_KMS_KEY=... PAYOUT_TAX_ID_KEY=... \
 *     node --import tsx scripts/backfill-credential-encryption.ts [--dry-run]
 *
 * Every key MUST be the exact value the Worker has (a ciphertext only
 * decrypts under the key that wrote it). After this reports 0 remaining,
 * approve 0602_clear_legacy_plaintext_connection_secrets.sql.
 */
import { neon } from "@neondatabase/serverless";
import { fileURLToPath } from "node:url";
import { argv } from "node:process";
import { CREDENTIALS_KEY_ENV } from "../src/services/crypto/credential-columns.js";
import {
  LEGACY_SECRET_PREFIX,
  openConnectionSecret,
  sealConnectionSecret,
} from "../src/services/provider-connections/connection-secrets.js";
import { withRetry } from "./run-sql-migrations.mjs";

/** The provider_connections secret columns. */
export const SECRET_COLUMNS = ["access_token_enc", "refresh_token_enc", "extra_secret_enc"] as const;

type Query = (text: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>;

const BATCH = 200;

export interface BackfillResult {
  resealed: Map<string, number>;
  failed: Map<string, number>;
}

export async function backfill(query: Query, masterKey: string, dryRun = false): Promise<BackfillResult> {
  const resealed = new Map<string, number>();
  const failed = new Map<string, number>();
  for (const column of SECRET_COLUMNS) {
    let done = 0;
    let errors = 0;
    let afterId = "00000000-0000-0000-0000-000000000000";
    for (;;) {
      const rows = await query(
        `SELECT id, "${column}" AS value FROM provider_connections
          WHERE "${column}" LIKE $1 AND id > $2 ORDER BY id LIMIT ${BATCH}`,
        [`${LEGACY_SECRET_PREFIX}%`, afterId],
      );
      if (rows.length === 0) break;
      afterId = String(rows[rows.length - 1]!.id);
      for (const row of rows) {
        const stored = String(row.value);
        try {
          const plaintext = await openConnectionSecret(stored, masterKey);
          if (!plaintext) continue;
          if (!dryRun) {
            const next = await sealConnectionSecret(plaintext, { masterKey });
            await query(
              `UPDATE provider_connections SET "${column}" = $1, updated_at = now() WHERE id = $2 AND "${column}" = $3`,
              [next, row.id, stored],
            );
          }
          done++;
        } catch (err) {
          errors++;
          const scheme = stored.slice(LEGACY_SECRET_PREFIX.length).split(":")[0];
          console.warn(`${column} ${row.id} (${scheme}): ${err instanceof Error ? err.message : err}`);
        }
      }
    }
    resealed.set(column, done);
    failed.set(column, errors);
  }
  return { resealed, failed };
}

async function remaining(query: Query): Promise<number> {
  let n = 0;
  for (const column of SECRET_COLUMNS) {
    const [row] = await query(`SELECT count(*)::int AS n FROM provider_connections WHERE "${column}" LIKE $1`, [
      `${LEGACY_SECRET_PREFIX}%`,
    ]);
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

  const { resealed, failed } = await backfill(query, masterKey, dryRun);
  for (const [column, n] of resealed) {
    console.log(`${column}: ${n} ${dryRun ? "legacy value(s) would be re-sealed" : "re-sealed"}, ${failed.get(column) ?? 0} failed`);
  }
  console.log(`remaining legacy secrets: ${await remaining(query)}`);
}

if (fileURLToPath(import.meta.url) === argv[1]) {
  main().catch((e) => {
    console.error("FATAL:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
