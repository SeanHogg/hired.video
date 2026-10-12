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
import { getOrSetCached, invalidateCachedKey } from "../../utils/edge-cache.js";
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
    if (!input.consent) return { stored: false };

    const role = ctx.roles ? resolveAccessRole(ctx.roles) : null;
    const last = input.events[input.events.length - 1];

    const sessionId = await this.repo.upsertSession({
      visitorId: input.visitorId,
      userId: ctx.userId ?? null,
      isAuthenticated: !!ctx.userId,
      role: ctx.userId ? role : null,
      entryPath: input.context?.entryPath ?? null,
      referrer: input.context?.referrer ?? null,
      utmSource: input.context?.utmSource ?? null,
      utmMedium: input.context?.utmMedium ?? null,
      utmCampaign: input.context?.utmCampaign ?? null,
      country: ctx.country ?? null,
      userAgent: ctx.userAgent ?? null,
      lastEventType: last?.type ?? null,
      lastPath: last?.path ?? null,
    });

    const events: InsertEventInput[] = input.events.map((e) => ({
      type: e.type,
      path: e.path,
      featureKey: e.featureKey ?? null,
      payload: e.payload ?? null,
      occurredAt: parseDate(e.occurredAt),
    }));
    await this.repo.insertEvents(sessionId, events);

    return { stored: true };
  }

  /** "Active now" sessions for staff. Cached (short TTL); a few seconds stale
   *  is fine for presence, and not invalidating per write avoids thrash. */
  async getActiveSessions(): Promise<ActiveSessionDto[]> {
    return getOrSetCached<ActiveSessionDto[]>({
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
    invalidateCachedKey(ACTIVE_CACHE_KEY);
    return n;
  }

  /** DSR — erase all usage rows for a user (called on account erasure). */
  async eraseForUser(userId: string): Promise<number> {
    const n = await this.repo.eraseByUser(userId);
    invalidateCachedKey(ACTIVE_CACHE_KEY);
    return n;
  }
}

function parseDate(iso: string | undefined): Date {
  if (!iso) return new Date();
  const d = new Date(iso);
  return isNaN(d.getTime()) ? new Date() : d;
}

function toIso(v: unknown): string {
  return v instanceof Date ? v.toISOString() : String(v);
}
