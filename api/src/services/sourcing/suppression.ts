/**
 * Suppression-list helpers.
 *
 * The resolver MUST consult this on every lookup, and every ingestion
 * job MUST consult it before persisting a sourced person. A hit short-
 * circuits the call and writes a `suppressed` integration_run for audit.
 */

import { eq, or } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { schema } from "../../db/index.js";
import { hashEmail, normalizeEmail, normalizeLinkedinUrl } from "./hash.js";
import type { SourcingQuery } from "./types.js";

export async function isQuerySuppressed(db: Db, query: SourcingQuery): Promise<boolean> {
  const checks: Array<{ type: string; value: string; hash?: string }> = [];

  if (query.kind === "email") {
    const email = normalizeEmail(query.value);
    checks.push({ type: "email", value: email, hash: await hashEmail(email) });
    const domain = email.split("@")[1];
    if (domain) checks.push({ type: "domain", value: domain });
  } else if (query.kind === "linkedin_url") {
    checks.push({ type: "linkedin_url", value: normalizeLinkedinUrl(query.value) });
  } else if (query.kind === "github_login") {
    checks.push({ type: "github_login", value: query.value.toLowerCase() });
  } else if (query.kind === "domain") {
    checks.push({ type: "domain", value: query.value.toLowerCase() });
  } else {
    return false;
  }

  for (const check of checks) {
    const conds = [
      eq(schema.dataSuppressionList.identifierType, check.type),
    ];
    const [hit] = await db
      .select({ id: schema.dataSuppressionList.id })
      .from(schema.dataSuppressionList)
      .where(
        check.hash
          ? or(
              eq(schema.dataSuppressionList.identifierValue, check.value),
              eq(schema.dataSuppressionList.identifierHash, check.hash),
            )
          : eq(schema.dataSuppressionList.identifierValue, check.value),
      )
      .limit(1);
    if (hit && conds.length) return true;
  }
  return false;
}

export async function addToSuppressionList(
  db: Db,
  input: {
    identifierType: string;
    identifierValue: string;
    reason: string;
    sourceDsrId?: string | null;
    addedBy?: string | null;
    notes?: string | null;
  },
): Promise<void> {
  const value = input.identifierValue.trim().toLowerCase();
  const hash = input.identifierType === "email" ? await hashEmail(value) : null;
  await db
    .insert(schema.dataSuppressionList)
    .values({
      identifierType: input.identifierType,
      identifierValue: value,
      identifierHash: hash,
      reason: input.reason,
      sourceDsrId: input.sourceDsrId ?? null,
      addedBy: input.addedBy ?? null,
      notes: input.notes ?? null,
    } as any)
    .onConflictDoNothing();
}
