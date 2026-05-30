/**
 * External LRS forwarder (#1400 build-strategy follow-on).
 *
 * Every xAPI statement we persist into the internal LRS gets mirrored
 * into each `external_lrs_targets` row that is `active=true` for the
 * statement's owner. Enterprise customers use this to consolidate
 * learning analytics inside Learning Locker / Watershed LRS / SCORM
 * Cloud / Yet — without us shipping an integration per vendor.
 *
 * Behaviour: fire-and-forget per target so a slow / down target doesn't
 * block the API path. Errors are persisted into `last_error` /
 * `last_error_at` so the connector UI surfaces a real status. Auth
 * modes (basic / bearer / none) cover the three patterns every xAPI
 * 1.0.3-compliant LRS accepts.
 *
 * Wire-up: the courses route's POST /api/courses/xapi/statements calls
 * `forwardStatementForUser(userId, statement)` after the row insert
 * succeeds. Inserted via Promise.allSettled() so any target failing
 * doesn't stop the others.
 */

import { and, eq } from "drizzle-orm";
import type { getDb } from "../../db/index.js";
import { schema } from "../../db/index.js";

const { externalLrsTargets } = schema;

type DbHandle = ReturnType<typeof getDb>;

interface XapiStatement {
  verb: { id: string; display?: string };
  object: { id: string; objectType?: string };
  result?: Record<string, unknown>;
  context?: Record<string, unknown>;
  timestamp?: string;
}

function buildAuthHeader(authMode: string, token: string | null): string | null {
  if (!token) return null;
  if (authMode === "basic") return `Basic ${token}`;
  if (authMode === "bearer") return `Bearer ${token}`;
  return null;
}

/** Forward an xAPI statement to every active LRS target for the given
 *  user. Returns immediately — work happens in the background but the
 *  returned promise resolves when every target has been pinged so test
 *  harnesses can await it. */
export async function forwardStatementForUser(
  db: DbHandle,
  userId: string,
  statement: XapiStatement,
): Promise<void> {
  const targets = await db.select()
    .from(externalLrsTargets)
    .where(and(eq(externalLrsTargets.userId, userId), eq(externalLrsTargets.active, true)));

  if (targets.length === 0) return;

  await Promise.allSettled(
    targets.map(async (target) => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Experience-API-Version": "1.0.3",
      };
      const auth = buildAuthHeader(target.authMode, target.authToken ?? null);
      if (auth) headers["Authorization"] = auth;
      const custom = target.customHeaders as Record<string, string> | null;
      if (custom) {
        for (const [k, v] of Object.entries(custom)) {
          if (typeof v === "string" && v.length < 1024) headers[k] = v;
        }
      }

      try {
        const res = await fetch(target.endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(statement),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          await db.update(externalLrsTargets)
            .set({
              lastError: `HTTP ${res.status}: ${text.slice(0, 400)}`,
              lastErrorAt: new Date(),
              updatedAt: new Date(),
            } as any)
            .where(eq(externalLrsTargets.id, target.id));
          return;
        }
        await db.update(externalLrsTargets)
          .set({
            lastSuccessAt: new Date(),
            lastError: null,
            updatedAt: new Date(),
          } as any)
          .where(eq(externalLrsTargets.id, target.id));
      } catch (e) {
        await db.update(externalLrsTargets)
          .set({
            lastError: e instanceof Error ? e.message.slice(0, 400) : String(e).slice(0, 400),
            lastErrorAt: new Date(),
            updatedAt: new Date(),
          } as any)
          .where(eq(externalLrsTargets.id, target.id));
      }
    }),
  );
}
