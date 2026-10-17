/**
 * One-time plaintext → AES-GCM tax-id backfill (#775), bridging #772
 * (write-side moved to ciphertext) and #774 (drop the legacy plaintext
 * column). Idempotent: only rows with plaintext and no ciphertext are read,
 * and each write re-asserts the no-ciphertext precondition so concurrent
 * runs can't double-encrypt.
 */
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { encryptTaxId } from "../payout/encryption.js";
import { invalidateTaxYearReports } from "../payout/TaxReportingService.js";

const { payoutProfiles } = schema;

export interface TaxIdBackfillReport {
  candidates: number;
  migrated: number;
  skippedEmpty: number;
  failed: number;
  failures: Array<{ id: string; reason: string }>;
}

export async function backfillTaxIds(env: Parameters<typeof encryptTaxId>[1]): Promise<TaxIdBackfillReport> {
  const db = getDb();
  const pending = await db
    .select({ id: payoutProfiles.id, taxIdEncrypted: payoutProfiles.taxIdEncrypted })
    .from(payoutProfiles)
    .where(and(isNotNull(payoutProfiles.taxIdEncrypted), isNull(payoutProfiles.taxIdCiphertext)));

  let migrated = 0;
  let skippedEmpty = 0;
  const failures: Array<{ id: string; reason: string }> = [];

  for (const row of pending) {
    const plaintext = (row.taxIdEncrypted ?? "").trim();
    if (!plaintext) {
      // Nothing to encrypt; clear it so #774's drop sees no surviving values.
      await db.update(payoutProfiles).set({ taxIdEncrypted: null }).where(eq(payoutProfiles.id, row.id));
      skippedEmpty += 1;
      continue;
    }
    try {
      const enc = await encryptTaxId(plaintext, env);
      await db
        .update(payoutProfiles)
        .set({
          taxIdCiphertext: enc.ciphertext,
          taxIdNonce: enc.nonce,
          taxIdKmsKeyId: enc.kmsKeyId,
          taxIdLast4: plaintext.replace(/\D/g, "").slice(-4) || null,
          taxIdEncrypted: null,
        })
        .where(and(eq(payoutProfiles.id, row.id), isNull(payoutProfiles.taxIdCiphertext)));
      migrated += 1;
    } catch (err) {
      failures.push({ id: row.id, reason: err instanceof Error ? err.message : "encryption failed" });
    }
  }
  // taxIdLast4 is surfaced on the annual report rows.
  if (pending.length > 0) invalidateTaxYearReports();

  return { candidates: pending.length, migrated, skippedEmpty, failed: failures.length, failures };
}
