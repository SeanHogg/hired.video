/**
 * Paid-media sync ledger: internal ↔ platform id refs
 * (paid_media_platform_refs) and the per-call audit trail
 * (paid_media_sync_runs).
 */

import { and, eq } from "drizzle-orm";
import { schema } from "../../db/index.js";
import type { PaidMediaPlatform } from "../../db/schema/paidmedia.js";
import type { DbHandle } from "./sync-account.js";

export async function findRef(d: DbHandle, internalId: string, resourceKind: string, accountId: string): Promise<typeof schema.paidMediaPlatformRefs.$inferSelect | null> {
  const [row] = await d.select().from(schema.paidMediaPlatformRefs).where(
    and(
      eq(schema.paidMediaPlatformRefs.internalId, internalId),
      eq(schema.paidMediaPlatformRefs.resourceKind, resourceKind),
      eq(schema.paidMediaPlatformRefs.accountId, accountId),
    ),
  ).limit(1);
  return row ?? null;
}

export async function upsertRef(
  d: DbHandle,
  args: {
    platform: PaidMediaPlatform;
    accountId: string;
    resourceKind: string;
    internalId: string;
    externalId: string;
    externalParentId?: string | null;
    error?: string | null;
  },
): Promise<void> {
  const existing = await findRef(d, args.internalId, args.resourceKind, args.accountId);
  if (existing) {
    await d.update(schema.paidMediaPlatformRefs)
      .set({
        externalId:       args.externalId,
        externalParentId: args.externalParentId ?? existing.externalParentId,
        syncStatus:       args.error ? "error" : "synced",
        lastSyncedAt:     new Date(),
        lastError:        args.error ?? null,
        updatedAt:        new Date(),
      })
      .where(eq(schema.paidMediaPlatformRefs.id, existing.id));
    return;
  }
  await d.insert(schema.paidMediaPlatformRefs).values({
    platform:         args.platform,
    accountId:        args.accountId,
    resourceKind:     args.resourceKind,
    internalId:       args.internalId,
    externalId:       args.externalId,
    externalParentId: args.externalParentId ?? null,
    syncStatus:       args.error ? "error" : "synced",
    lastSyncedAt:     new Date(),
    lastError:        args.error ?? null,
  } as any);
}

export async function recordSyncRun(d: DbHandle, args: {
  platform: PaidMediaPlatform;
  accountId: string;
  direction: "push" | "pull";
  operation: string;
  resourceKind?: string;
  internalId?: string;
  externalId?: string;
  idempotencyKey?: string;
  request?: unknown;
  response?: unknown;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  durationMs: number;
}): Promise<void> {
  await d.insert(schema.paidMediaSyncRuns).values({
    platform:        args.platform,
    accountId:       args.accountId,
    direction:       args.direction,
    operation:       args.operation,
    resourceKind:    args.resourceKind ?? null,
    internalId:      args.internalId ?? null,
    externalId:      args.externalId ?? null,
    idempotencyKey:  args.idempotencyKey ?? null,
    requestPayload:  args.request ?? null,
    responsePayload: args.response ?? null,
    success:         args.success,
    errorCode:       args.errorCode ?? null,
    errorMessage:    args.errorMessage ?? null,
    durationMs:      args.durationMs,
  } as any);
}
