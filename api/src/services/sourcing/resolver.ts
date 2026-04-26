/**
 * Cache-first sourcing resolver.
 *
 * Lookup order:
 *   1. Suppression list — short-circuit; never spend, never persist.
 *   2. enrichment_cache (per-integration, TTL-aware).
 *   3. person_identifiers — if we have the canonical person already, return it.
 *   4. Fall through to provider chain (cheapest capable provider first).
 *   5. Write through to enrichment_cache + sourced_people + person_sources.
 *
 * Steady-state target: 70-85% cache hit rate so the marginal $/source is low.
 */

import { and, asc, eq } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { schema } from "../../db/index.js";
import {
  buildQueryKey,
  hashEmail,
  normalizeEmail,
  normalizeLinkedinUrl,
} from "./hash.js";
import { isQuerySuppressed } from "./suppression.js";
import { getProvider } from "./registry.js";
import {
  ProviderError,
  type ProviderContext,
  type SourcingProvider,
  type SourcingQuery,
  type SourcingResult,
} from "./types.js";

const DEFAULT_TTL_DAYS = 90;

export interface ResolveOptions {
  /** Skip cache and force a fresh provider call (still writes through). */
  bypassCache?: boolean;
  /** Limit which integrations are eligible — default: all enabled. */
  allowedIntegrationSlugs?: string[];
  /** TTL override in days. */
  ttlDays?: number;
}

export interface ResolveOutcome {
  /** 'cache_hit' | 'cache_miss_resolved' | 'not_found' | 'suppressed' | 'no_providers'. */
  status:
    | "cache_hit"
    | "cache_miss_resolved"
    | "not_found"
    | "suppressed"
    | "no_providers";
  result: SourcingResult | null;
  /** integrations.id that ultimately served the result (null if not_found). */
  integrationId: string | null;
  /** If we hit cache, this is the row id. */
  cacheRowId: string | null;
  /** Cents debited from the user's enrichment_credits. 0 on cache hit / suppressed. */
  costCents: number;
  cacheHit: boolean;
  durationMs: number;
}

interface RegistryRow {
  id: string;
  slug: string;
  enabled: boolean;
  reviewStatus: string;
  costPerCallCents: number;
  capabilities: Record<string, boolean>;
  pricingModel: string;
}

async function loadEnabledIntegrations(db: Db, allowed?: string[]): Promise<RegistryRow[]> {
  const rows = await db
    .select({
      id: schema.integrations.id,
      slug: schema.integrations.slug,
      enabled: schema.integrations.enabled,
      reviewStatus: schema.integrations.reviewStatus,
      costPerCallCents: schema.integrations.costPerCallCents,
      capabilities: schema.integrations.capabilities,
      pricingModel: schema.integrations.pricingModel,
    })
    .from(schema.integrations)
    .where(and(eq(schema.integrations.enabled, true), eq(schema.integrations.reviewStatus, "approved")));
  const filtered = allowed?.length ? rows.filter((r) => allowed.includes(r.slug)) : rows;
  return filtered as RegistryRow[];
}

async function loadCredentials(db: Db, integrationId: string, env: Record<string, unknown>) {
  const [row] = await db
    .select()
    .from(schema.integrationCredentials)
    .where(eq(schema.integrationCredentials.integrationId, integrationId))
    .limit(1);
  if (!row) return { apiKey: null, extra: {} };
  const apiKey = (env[row.envVarName] as string | undefined) ?? null;
  const extraDefs = (row.extra ?? {}) as Record<string, string>;
  const extra: Record<string, string | null> = {};
  for (const [k, envVar] of Object.entries(extraDefs)) {
    extra[k] = (env[envVar] as string | undefined) ?? null;
  }
  return { apiKey, extra };
}

function pickProviderRow(
  rows: RegistryRow[],
  query: SourcingQuery["kind"],
): RegistryRow[] {
  // Order by cost ascending — cheapest capable provider wins. Free providers
  // (cost 0) sort first, then paid providers cheapest-to-most-expensive.
  return rows
    .filter((r) => {
      const caps = r.capabilities ?? {};
      switch (query) {
        case "email":         return caps.enrichByEmail === true;
        case "linkedin_url":  return caps.enrichByLinkedIn === true;
        case "github_login":  return caps.enrichByHandle === true;
        case "name_company":  return caps.enrichByName === true || caps.emailFinder === true;
        case "domain":        return caps.emailFinder === true;
      }
    })
    .sort((a, b) => a.costPerCallCents - b.costPerCallCents);
}

async function readCache(
  db: Db,
  queryKey: string,
  integrationIds: string[],
  bypass: boolean,
): Promise<{ row: typeof schema.enrichmentCache.$inferSelect; integrationId: string } | null> {
  if (bypass || integrationIds.length === 0) return null;
  const rows = await db
    .select()
    .from(schema.enrichmentCache)
    .where(eq(schema.enrichmentCache.queryKey, queryKey))
    .orderBy(asc(schema.enrichmentCache.createdAt));
  const eligible = rows.filter((r) => integrationIds.includes(r.integrationId));
  for (const r of eligible) {
    if (!r.expiresAt || r.expiresAt > new Date()) {
      return { row: r, integrationId: r.integrationId };
    }
  }
  return null;
}

async function upsertPerson(db: Db, integrationId: string, result: SourcingResult): Promise<string> {
  const emailHash = result.email ? await hashEmail(result.email) : null;
  const linkedinUrl = result.linkedinUrl ? normalizeLinkedinUrl(result.linkedinUrl) : null;
  const githubLogin = result.githubLogin?.toLowerCase();

  // Try identifier match first (any of email_hash / linkedin / github).
  const identifierMatches: Array<{ type: string; value: string }> = [];
  if (emailHash && result.email) identifierMatches.push({ type: "email_hash", value: emailHash });
  if (linkedinUrl) identifierMatches.push({ type: "linkedin_url", value: linkedinUrl });
  if (githubLogin) identifierMatches.push({ type: "github_login", value: githubLogin });

  let personId: string | null = null;
  for (const m of identifierMatches) {
    const [hit] = await db
      .select()
      .from(schema.personIdentifiers)
      .where(and(eq(schema.personIdentifiers.identifierType, m.type), eq(schema.personIdentifiers.identifierValue, m.value)))
      .limit(1);
    if (hit) {
      personId = hit.personId;
      break;
    }
  }

  if (!personId) {
    const [created] = await db
      .insert(schema.sourcedPeople)
      .values({
        fullName: result.fullName ?? null,
        givenName: result.givenName ?? null,
        familyName: result.familyName ?? null,
        primaryEmail: result.email ?? null,
        primaryEmailHash: emailHash ?? null,
        primaryLinkedinUrl: linkedinUrl ?? null,
        primaryGithubLogin: githubLogin ?? null,
        currentTitle: result.title ?? null,
        currentCompany: result.company ?? null,
        location: result.location ?? null,
        countryCode: result.countryCode ?? null,
        primarySourceIntegrationId: integrationId,
      } as any)
      .returning({ id: schema.sourcedPeople.id });
    personId = created.id;
  } else {
    // Patch missing canonical fields with new values.
    await db
      .update(schema.sourcedPeople)
      .set({
        fullName: result.fullName ?? undefined,
        primaryEmail: result.email ?? undefined,
        primaryEmailHash: emailHash ?? undefined,
        primaryLinkedinUrl: linkedinUrl ?? undefined,
        primaryGithubLogin: githubLogin ?? undefined,
        currentTitle: result.title ?? undefined,
        currentCompany: result.company ?? undefined,
        location: result.location ?? undefined,
        countryCode: result.countryCode ?? undefined,
        updatedAt: new Date(),
      } as any)
      .where(eq(schema.sourcedPeople.id, personId));
  }

  // Upsert each identifier — onConflictDoNothing because the unique index
  // catches duplicates across providers.
  for (const m of identifierMatches) {
    await db
      .insert(schema.personIdentifiers)
      .values({ personId, identifierType: m.type, identifierValue: m.value, isVerified: false } as any)
      .onConflictDoNothing();
  }
  if (result.email) {
    await db
      .insert(schema.personIdentifiers)
      .values({ personId, identifierType: "email", identifierValue: normalizeEmail(result.email), isVerified: false } as any)
      .onConflictDoNothing();
  }
  if (result.twitterHandle) {
    await db
      .insert(schema.personIdentifiers)
      .values({
        personId,
        identifierType: "twitter_handle",
        identifierValue: result.twitterHandle.replace(/^@/, "").toLowerCase(),
        isVerified: false,
      } as any)
      .onConflictDoNothing();
  }
  for (const extra of result.extraIdentifiers ?? []) {
    await db
      .insert(schema.personIdentifiers)
      .values({ personId, identifierType: extra.type, identifierValue: extra.value, isVerified: false } as any)
      .onConflictDoNothing();
  }

  return personId;
}

async function writeCache(
  db: Db,
  queryKey: string,
  integrationId: string,
  personId: string | null,
  result: SourcingResult,
  ttlDays: number,
): Promise<string> {
  const expiresAt = result.staleAt
    ? new Date(result.staleAt)
    : new Date(Date.now() + ttlDays * 86_400_000);

  // Upsert by (query_key, integration_id). On conflict, refresh payload + ttl.
  const [row] = await db
    .insert(schema.enrichmentCache)
    .values({
      queryKey,
      integrationId,
      personId,
      payload: result.rawPayload ?? {},
      expiresAt,
      hits: 0,
    } as any)
    .onConflictDoUpdate({
      target: [schema.enrichmentCache.queryKey, schema.enrichmentCache.integrationId],
      set: { payload: result.rawPayload ?? {}, expiresAt, personId } as any,
    })
    .returning({ id: schema.enrichmentCache.id });

  if (personId) {
    await db
      .insert(schema.personSources)
      .values({
        personId,
        integrationId,
        payload: result.rawPayload ?? {},
        staleAt: expiresAt,
      } as any);
  }
  return row.id;
}

async function recordRun(
  db: Db,
  input: {
    integrationId: string;
    userId?: string | null;
    kind: string;
    status: string;
    query: SourcingQuery;
    result?: SourcingResult | null;
    costCents: number;
    cacheHit: boolean;
    errorMessage?: string;
    durationMs: number;
  },
): Promise<void> {
  await db.insert(schema.integrationRuns).values({
    integrationId: input.integrationId,
    userId: input.userId ?? null,
    kind: input.kind,
    status: input.status,
    query: input.query as any,
    result: (input.result as any) ?? null,
    costCents: input.costCents,
    cacheHit: input.cacheHit,
    errorMessage: input.errorMessage ?? null,
    durationMs: input.durationMs,
  } as any);
}

export async function resolve(
  db: Db,
  env: Record<string, unknown>,
  query: SourcingQuery,
  opts: { userId?: string | null } & ResolveOptions = {},
): Promise<ResolveOutcome> {
  const t0 = Date.now();
  const ttlDays = opts.ttlDays ?? DEFAULT_TTL_DAYS;

  // 1. Suppression check.
  if (await isQuerySuppressed(db, query)) {
    return {
      status: "suppressed",
      result: null,
      integrationId: null,
      cacheRowId: null,
      costCents: 0,
      cacheHit: false,
      durationMs: Date.now() - t0,
    };
  }

  // 2. Cache lookup.
  const queryKey = await buildQueryKey(query);
  const enabledRows = await loadEnabledIntegrations(db, opts.allowedIntegrationSlugs);
  const cached = await readCache(
    db,
    queryKey,
    enabledRows.map((r) => r.id),
    opts.bypassCache === true,
  );
  if (cached) {
    await db
      .update(schema.enrichmentCache)
      .set({ hits: (cached.row.hits ?? 0) + 1, lastHitAt: new Date() } as any)
      .where(eq(schema.enrichmentCache.id, cached.row.id));
    const result: SourcingResult = {
      found: true,
      rawPayload: cached.row.payload,
    };
    // Project canonical person row into the result if we still have one.
    if (cached.row.personId) {
      const [p] = await db
        .select()
        .from(schema.sourcedPeople)
        .where(eq(schema.sourcedPeople.id, cached.row.personId))
        .limit(1);
      if (p && !p.isRedacted) {
        result.fullName = p.fullName ?? undefined;
        result.email = p.primaryEmail ?? undefined;
        result.linkedinUrl = p.primaryLinkedinUrl ?? undefined;
        result.githubLogin = p.primaryGithubLogin ?? undefined;
        result.title = p.currentTitle ?? undefined;
        result.company = p.currentCompany ?? undefined;
        result.location = p.location ?? undefined;
        result.countryCode = p.countryCode ?? undefined;
      }
    }
    await recordRun(db, {
      integrationId: cached.integrationId,
      userId: opts.userId,
      kind: "lookup",
      status: "cache_hit",
      query,
      result,
      costCents: 0,
      cacheHit: true,
      durationMs: Date.now() - t0,
    });
    return {
      status: "cache_hit",
      result,
      integrationId: cached.integrationId,
      cacheRowId: cached.row.id,
      costCents: 0,
      cacheHit: true,
      durationMs: Date.now() - t0,
    };
  }

  // 3. Provider chain.
  const candidates = pickProviderRow(enabledRows, query.kind);
  if (candidates.length === 0) {
    return {
      status: "no_providers",
      result: null,
      integrationId: null,
      cacheRowId: null,
      costCents: 0,
      cacheHit: false,
      durationMs: Date.now() - t0,
    };
  }

  let lastError: ProviderError | null = null;
  for (const row of candidates) {
    const provider: SourcingProvider | undefined = getProvider(row.slug);
    if (!provider || !provider.supports(query.kind)) continue;

    const creds = await loadCredentials(db, row.id, env);
    const ctx: ProviderContext = {
      integrationId: row.id,
      slug: row.slug,
      costPerCallCents: row.costPerCallCents,
      apiKey: creds.apiKey,
      extra: creds.extra,
      env,
    };
    if (!provider.isConfigured(ctx)) {
      await recordRun(db, {
        integrationId: row.id,
        userId: opts.userId,
        kind: "lookup",
        status: "no_credentials",
        query,
        costCents: 0,
        cacheHit: false,
        durationMs: Date.now() - t0,
      });
      continue;
    }

    try {
      const result = await provider.enrich(ctx, query);
      if (!result.found) {
        await recordRun(db, {
          integrationId: row.id,
          userId: opts.userId,
          kind: "lookup",
          status: "not_found",
          query,
          result,
          costCents: row.costPerCallCents,
          cacheHit: false,
          durationMs: Date.now() - t0,
        });
        // Cache negative result briefly (1 day) to avoid repeated paid no-ops.
        await writeCache(db, queryKey, row.id, null, result, 1);
        continue;
      }
      const personId = await upsertPerson(db, row.id, result);
      const cacheRowId = await writeCache(db, queryKey, row.id, personId, result, ttlDays);
      await recordRun(db, {
        integrationId: row.id,
        userId: opts.userId,
        kind: "lookup",
        status: "success",
        query,
        result,
        costCents: row.costPerCallCents,
        cacheHit: false,
        durationMs: Date.now() - t0,
      });
      return {
        status: "cache_miss_resolved",
        result,
        integrationId: row.id,
        cacheRowId,
        costCents: row.costPerCallCents,
        cacheHit: false,
        durationMs: Date.now() - t0,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastError = err instanceof ProviderError ? err : new ProviderError(row.slug, "UNKNOWN", msg);
      await recordRun(db, {
        integrationId: row.id,
        userId: opts.userId,
        kind: "lookup",
        status: "error",
        query,
        costCents: 0,
        cacheHit: false,
        errorMessage: msg,
        durationMs: Date.now() - t0,
      });
      // Continue to the next provider — failover.
    }
  }

  return {
    status: "not_found",
    result: null,
    integrationId: null,
    cacheRowId: null,
    costCents: 0,
    cacheHit: false,
    durationMs: Date.now() - t0,
  };
}
