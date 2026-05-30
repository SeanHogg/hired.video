import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Variables, AppEnv } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { TIER_COPY } from "../../../shared/tier-copy.js";
import { getOrSetCached, invalidateCachedKey } from "../utils/edge-cache.js";

export const featureFlagRoutes = new Hono<AppEnv>();

function ok<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
}

// Seed default flags if the table is empty (idempotent on subsequent calls).
const DEFAULT_FLAGS = [
  { key: "new_dashboard", name: "New Dashboard", description: "Enable redesigned dashboard experience", enabled: false, rolloutPercentage: 0 },
  { key: "ai_copilot", name: "AI Career Copilot", description: "Surface AI-generated career action plan on dashboard", enabled: false, rolloutPercentage: 0 },
  { key: "magic_links", name: "Magic Link Login", description: "Allow passwordless login via email magic links", enabled: true, rolloutPercentage: 100 },
  { key: "sponsored_jobs", name: "Sponsored Job Listings", description: "Show sponsored/boosted jobs at top of listings", enabled: false, rolloutPercentage: 0 },
  { key: "featured_profiles", name: "Featured Candidate Profiles", description: "Allow job seekers to pay to boost profile visibility", enabled: false, rolloutPercentage: 0 },
  { key: "smart_notifications", name: "Smart Notification Ranking", description: TIER_COPY.proUserDescription("AI-ranked notification feed"), enabled: true, rolloutPercentage: 100 },
];

// Two-layer cache key — L1 in-process Map + L2 Cloudflare Workers KV — so
// admin flag flips propagate across every isolate (gap #1361). The KV layer
// is best-effort; missing binding falls through to the in-process cache.
const FLAGS_CACHE_KEY = "featureflag:all";
const FLAGS_TTL_SECONDS = 60;

type FlagRow = typeof schema.featureFlags.$inferSelect;

/** Coerce KV's ISO-string Date fields back to Date so downstream consumers
 *  that expect `f.updatedAt instanceof Date` (admin UI, audit logs) work. */
function reviveFlags(raw: unknown): FlagRow[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.map((r: any) => ({
    ...r,
    createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
    updatedAt: r.updatedAt ? new Date(r.updatedAt) : new Date(),
  }));
}

export function invalidateFeatureFlagCache(): void {
  // Drops the entry from both the in-process Map and KV so every isolate
  // gets a fresh load on next read instead of waiting for the TTL.
  invalidateCachedKey(FLAGS_CACHE_KEY);
}

// Exported so the /api/bootstrap aggregate (gap #1367) can include flags
// in the same response that returns the user + billing + verification — the
// cache + invalidator are shared so admin flips still propagate correctly.
export async function loadFlags(): Promise<FlagRow[]> {
  return getOrSetCached<FlagRow[]>({
    key: FLAGS_CACHE_KEY,
    ttlSeconds: FLAGS_TTL_SECONDS,
    revive: reviveFlags,
    loader: async () => {
      const db = getDb();
      try {
        let flags = await db.select().from(schema.featureFlags).orderBy(schema.featureFlags.key);
        const existingKeys = new Set(flags.map((f) => f.key));
        const toInsert = DEFAULT_FLAGS.filter((f) => !existingKeys.has(f.key));
        if (toInsert.length) {
          await db.insert(schema.featureFlags).values(toInsert as any[]);
          flags = await db.select().from(schema.featureFlags).orderBy(schema.featureFlags.key);
        }
        return flags;
      } catch {
        // Table may not exist yet (pre-migration) — synthesise from defaults.
        return DEFAULT_FLAGS.map((f) => ({
          ...f,
          id: crypto.randomUUID(),
          conditions: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        })) as unknown as FlagRow[];
      }
    },
  });
}

// Evaluate whether a flag is active for a given user.
// Rollout is deterministic: hash(userId + flagKey) % 100 < rolloutPercentage
export function isEnabledForUser(flag: { enabled: boolean; rolloutPercentage: number }, userId: string, flagKey: string): boolean {
  if (!flag.enabled) return false;
  if (flag.rolloutPercentage >= 100) return true;
  if (flag.rolloutPercentage <= 0) return false;
  // Simple deterministic hash
  let hash = 0;
  const input = `${userId}:${flagKey}`;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % 100) < flag.rolloutPercentage;
}

// GET /featureflag — list all flags and per-user evaluation
featureFlagRoutes.get("/", async (c) => {
  const userId = c.var.user?.sub ?? "anonymous";
  const flags = await loadFlags();

  const userFlags: Record<string, boolean> = {};
  for (const flag of flags) {
    userFlags[flag.key] = isEnabledForUser(flag, userId, flag.key);
  }

  return c.json(ok({ flags, userFlags }), 200);
});

// GET /featureflag/:key — evaluate a single flag for the current user.
// Uses the same in-memory cache as the list endpoint to avoid a per-request
// DB round-trip on hot paths that gate UI features.
featureFlagRoutes.get("/:key", async (c) => {
  const flagKey = c.req.param("key");
  const userId = c.var.user?.sub ?? "anonymous";
  const flags = await loadFlags();
  const flag = flags.find((f) => f.key === flagKey);
  if (!flag) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Flag not found" } }, 404);

  const enabled = isEnabledForUser(flag, userId, flag.key);
  return c.json(ok({ ...flag, enabledForUser: enabled }), 200);
});

// PATCH /featureflag/:key — update a flag (admin only in a real implementation; open here for now)
featureFlagRoutes.patch("/:key", async (c) => {
  const flagKey = c.req.param("key");
  const body = await c.req.json().catch(() => ({}));
  const db = getDb();

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.enabled === "boolean") updates.enabled = body.enabled;
  if (typeof body.rolloutPercentage === "number") updates.rolloutPercentage = Math.min(100, Math.max(0, body.rolloutPercentage));
  if (body.conditions !== undefined) updates.conditions = body.conditions;

  const [updated] = await db
    .update(schema.featureFlags)
    .set(updates as any)
    .where(eq(schema.featureFlags.key, flagKey))
    .returning();

  if (!updated) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Flag not found" } }, 404);
  // Invalidate the in-memory cache so admin toggles take effect on the next
  // read instead of waiting for the 60s TTL to expire (gap #1361).
  invalidateFeatureFlagCache();
  return c.json(ok(updated), 200);
});

featureFlagRoutes.all("*", (c) =>
  c.json({ success: false, error: { code: "NOT_FOUND", message: "Feature flag route not found" }, timestamp: new Date().toISOString() }, 404),
);
