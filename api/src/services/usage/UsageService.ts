/**
 * UsageService — business logic for usage tracking + presence (#2043-2046).
 *
 * Ingestion (`recordBatch`) is consent-gated: a batch with consent=false is
 * dropped, nothing stored. Presence (`getActiveSessions`) is the hot staff read
 * and is allowed to be a few seconds stale, so it's served through the
 * read-through cache with a short TTL and NOT invalidated per write (every
 * beacon would otherwise thrash it). DSR erase drops a visitor's/user's rows.
 */
import type {
  IUsageTrackingRepository,
  InsertEventInput,
} from "../../repositories/usageTrackingRepository.js";
import { getOrSetCached } from "../../utils/edge-cache.js";
import { getOrSetIsolateCached, invalidateIsolateKey } from "../../utils/isolate-cache.js";
import { resolveAccessRole } from "../../../../shared/role-access.js";
import {
  ACTIVE_WINDOW_MINUTES,
  type ActiveSessionDto,
  type TrackUsageInput,
} from "../../../../shared/usage.js";

const CACHE_VERSION = "v1";
const ACTIVE_CACHE_KEY = `usage:active:${CACHE_VERSION}`;
const ACTIVE_TTL_SECONDS = 15;
const FEATURE_TTL_SECONDS = 300;
const featureKey = (role: string) => `usage:feat:${CACHE_VERSION}:${role}`;

/** Request-derived context the route supplies (never trusted from the body). */
export interface UsageRequestContext {
  userId?: string | null;
  roles?: readonly string[] | null;
  country?: string | null;
  userAgent?: string | null;
}

export class UsageService {
  constructor(private readonly repo: IUsageTrackingRepository) {}

  /** Ingest a consent-gated batch. Returns whether it was stored. */
  async recordBatch(
    input: TrackUsageInput,
    ctx: UsageRequestContext,
  ): Promise<{ stored: boolean }> {
    const { stored } = await this.recordBatches([input], ctx);
    return { stored: stored > 0 };
  }

  /**
   * Ingest several batches from ONE request (the analytics beacon carries up
   * to 50). Consent-false batches are dropped; the rest are merged per
   * visitor so each distinct session costs exactly one upsert + one events
   * insert, however many batches it arrived in. Entry context comes from the
   * visitor's first batch (it is only set on insert anyway); the "latest
   * activity" stamp comes from the visitor's last event. Returns how many
   * input batches were stored.
   */
  async recordBatches(
    inputs: readonly TrackUsageInput[],
    ctx: UsageRequestContext,
  ): Promise<{ stored: number }> {
    const merged = mergeByVisitor(inputs.filter((i) => i.consent));
    if (merged.length === 0) return { stored: 0 };

    const role = ctx.userId && ctx.roles ? resolveAccessRole(ctx.roles) : null;
    await Promise.all(
      merged.map(async (m) => {
        const last = m.events[m.events.length - 1];
        const sessionId = await this.repo.upsertSession({
          visitorId: m.visitorId,
          userId: ctx.userId ?? null,
          isAuthenticated: !!ctx.userId,
          role,
          entryPath: m.context?.entryPath ?? null,
          referrer: m.context?.referrer ?? null,
          utmSource: m.context?.utmSource ?? null,
          utmMedium: m.context?.utmMedium ?? null,
          utmCampaign: m.context?.utmCampaign ?? null,
          country: ctx.country ?? null,
          userAgent: ctx.userAgent ?? null,
          lastEventType: last?.type ?? null,
          lastPath: last?.path ?? null,
        });
        const events: InsertEventInput[] = m.events.map((e) => ({
          type: e.type,
          path: e.path,
          featureKey: e.featureKey ?? null,
          payload: e.payload ?? null,
          occurredAt: parseDate(e.occurredAt),
        }));
        await this.repo.insertEvents(sessionId, events);
      }),
    );
    return { stored: merged.reduce((n, m) => n + m.batchCount, 0) };
  }

  /** "Active now" sessions for staff. Cached (short TTL); a few seconds stale
   *  is fine for presence, and not invalidating per write avoids thrash. */
  async getActiveSessions(): Promise<ActiveSessionDto[]> {
    // Isolate-only: a 15s shared KV key refilled under staff polling was a
    // KV write every 15s.
    return getOrSetIsolateCached<ActiveSessionDto[]>({
      key: ACTIVE_CACHE_KEY,
      ttlSeconds: ACTIVE_TTL_SECONDS,
      loader: async () => {
        const since = new Date(Date.now() - ACTIVE_WINDOW_MINUTES * 60_000);
        const rows = await this.repo.listActiveSessions(since);
        return rows.map((r) => ({
          sessionId: r.id,
          visitorId: r.visitorId,
          userId: r.userId,
          isAuthenticated: r.isAuthenticated,
          role: r.role,
          lastSeen: toIso(r.lastSeen),
          entryPath: r.entryPath,
          country: r.country,
          lastEventType: r.lastEventType,
          lastPath: r.lastPath,
        }));
      },
    });
  }

  /** Per-feature event counts for a role over the last 30 days (usage→access
   *  hints in /admin/role-access). Cached. */
  async getFeatureUsageForRole(role: string): Promise<Record<string, number>> {
    return getOrSetCached<Record<string, number>>({
      key: featureKey(role),
      ttlSeconds: FEATURE_TTL_SECONDS,
      loader: async () => {
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const counts = await this.repo.featureUsageForRole(role, since);
        return Object.fromEntries(counts.map((c) => [c.featureKey, c.count]));
      },
    });
  }

  /** DSR — erase a visitor's session + events (cascade). */
  async eraseForVisitor(visitorId: string): Promise<number> {
    const n = await this.repo.eraseByVisitor(visitorId);
    invalidateIsolateKey(ACTIVE_CACHE_KEY);
    return n;
  }

  /** DSR — erase all usage rows for a user (called on account erasure). */
  async eraseForUser(userId: string): Promise<number> {
    const n = await this.repo.eraseByUser(userId);
    invalidateIsolateKey(ACTIVE_CACHE_KEY);
    return n;
  }
}

interface MergedVisitorBatch {
  visitorId: string;
  context: TrackUsageInput["context"];
  events: TrackUsageInput["events"];
  batchCount: number;
}

/** Fold batches sharing a visitorId into one (order preserved). */
function mergeByVisitor(inputs: readonly TrackUsageInput[]): MergedVisitorBatch[] {
  const byVisitor = new Map<string, MergedVisitorBatch>();
  for (const input of inputs) {
    const existing = byVisitor.get(input.visitorId);
    if (existing) {
      existing.events = [...existing.events, ...input.events];
      existing.context = existing.context ?? input.context;
      existing.batchCount++;
    } else {
      byVisitor.set(input.visitorId, {
        visitorId: input.visitorId,
        context: input.context,
        events: [...input.events],
        batchCount: 1,
      });
    }
  }
  return [...byVisitor.values()];
}

function parseDate(iso: string | undefined): Date {
  if (!iso) return new Date();
  const d = new Date(iso);
  return isNaN(d.getTime()) ? new Date() : d;
}

function toIso(v: unknown): string {
  return v instanceof Date ? v.toISOString() : String(v);
}
