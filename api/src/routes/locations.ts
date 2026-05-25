/**
 * /api/locations — reference-data endpoints powering every LocationPicker
 * + LocationFilter UI surface.
 *
 *   GET /api/locations/countries                 → all active countries
 *   GET /api/locations/states?countryId=         → states for a country
 *   GET /api/locations/cities?stateId=&q=        → cities for a state, optionally narrowed by prefix
 *   GET /api/locations/search?q=                 → Mapbox forward-geocode (with seed fallback)
 *   GET /api/locations/reverse?lat=&lng=         → "use my location" reverse geocode
 *
 * The picker hits /countries on mount, then /states + /cities as the
 * user drills down. The "search" endpoint backs the autocomplete free-
 * text field — it returns a normalized place + the resolved structured
 * ids the frontend stores in the form state. When MAPBOX_TOKEN is
 * unset the search endpoint falls back to a case-insensitive prefix
 * lookup over the seeded cities/states/countries.
 */
import { Hono } from "hono";
import { and, asc, eq, ilike, sql } from "drizzle-orm";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { buildApiDeps } from "../services/apiDeps.js";
import { LocationService } from "../services/location/LocationService.js";
import {
  CONTENT_LOCATION_KINDS,
  ContentLocationSetSchema,
  type ContentLocationKind,
} from "../../../shared/content-locations.js";

const { countries, stateProvinces, cities, jobItems, resumeInformation, videos, studioVoiceClones, studioTemplates, articles, userProfiles, companyProfiles, talentPoolCandidates, serviceOfferings } = schema;

export const locationRoutes = new Hono<{ Variables: Variables }>();

locationRoutes.get("/countries", async (c) => {
  const db = getDb();
  const rows = await db
    .select({
      id: countries.id,
      name: countries.name,
      iso2: countries.iso2,
      iso3: countries.iso3,
      phoneCode: countries.phoneCode,
      currency: countries.currency,
    })
    .from(countries)
    .where(eq(countries.isActive, true))
    .orderBy(asc(countries.name));
  return c.json(success(rows), 200);
});

locationRoutes.get("/states", async (c) => {
  const countryIdRaw = c.req.query("countryId");
  const countryIso2 = c.req.query("countryIso2");
  const db = getDb();

  let countryId: number | null = null;
  if (countryIdRaw && /^\d+$/.test(countryIdRaw)) {
    countryId = Number(countryIdRaw);
  } else if (countryIso2) {
    const [row] = await db
      .select({ id: countries.id })
      .from(countries)
      .where(eq(countries.iso2, countryIso2.toUpperCase()))
      .limit(1);
    countryId = (row as { id: number } | undefined)?.id ?? null;
  }
  if (countryId == null) {
    return c.json(success([]), 200);
  }

  const rows = await db
    .select({
      id: stateProvinces.id,
      name: stateProvinces.name,
      code: stateProvinces.code,
      countryId: stateProvinces.countryId,
    })
    .from(stateProvinces)
    .where(
      and(eq(stateProvinces.countryId, countryId), eq(stateProvinces.isActive, true)),
    )
    .orderBy(asc(stateProvinces.name));
  return c.json(success(rows), 200);
});

locationRoutes.get("/cities", async (c) => {
  const stateId = c.req.query("stateId");
  const q = (c.req.query("q") ?? "").trim();
  if (!stateId) return c.json(success([]), 200);
  const db = getDb();

  const whereClauses = [eq(cities.stateId, stateId), eq(cities.isActive, true)];
  if (q.length > 0) {
    whereClauses.push(ilike(cities.name, `${q}%`));
  }

  const rows = await db
    .select({
      id: cities.id,
      name: cities.name,
      stateId: cities.stateId,
      latitude: cities.latitude,
      longitude: cities.longitude,
    })
    .from(cities)
    .where(and(...whereClauses))
    .orderBy(asc(cities.name))
    .limit(100);
  return c.json(success(rows), 200);
});

// Autocomplete — Mapbox passthrough with seed-table fallback. Returns
// normalized hits with structured ids the form state can store directly.
locationRoutes.get("/search", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  const countryIso2 = c.req.query("country")?.toUpperCase();
  if (!q) return c.json(success([]), 200);

  const env = (c.env ?? {}) as Record<string, string | undefined>;
  const deps = buildApiDeps(env);
  const service = new LocationService(deps);

  // Live geocoder path — Mapbox returns the richest results and we
  // ensure each one exists in the local reference tables so future
  // saves can store the resolved ids.
  if (deps.geocoder.isLive()) {
    const places = await deps.geocoder.forward(q, { limit: 6, countryIso2 });
    const resolved = await Promise.all(
      places.map(async (p) => {
        const r = await service.ensureGeocodedPlace(p);
        return {
          label: p.label,
          placeType: p.placeType,
          countryId: r.countryId,
          stateId: r.stateId,
          cityId: r.cityId,
          postalCode: r.postalCode,
          latitude: r.latitude,
          longitude: r.longitude,
        };
      }),
    );
    return c.json(success(resolved), 200);
  }

  // Fallback — prefix-match seeded cities/states/countries.
  const db = getDb();
  const lc = q.toLowerCase();
  const cityHits = (await db
    .select({
      cityId: cities.id,
      cityName: cities.name,
      cityLat: cities.latitude,
      cityLng: cities.longitude,
      stateId: stateProvinces.id,
      stateName: stateProvinces.name,
      stateCode: stateProvinces.code,
      countryId: countries.id,
      countryName: countries.name,
      countryIso2: countries.iso2,
    })
    .from(cities)
    .innerJoin(stateProvinces, eq(stateProvinces.id, cities.stateId))
    .innerJoin(countries, eq(countries.id, stateProvinces.countryId))
    .where(sql`lower(${cities.name}) LIKE ${lc + "%"}`)
    .limit(6)) as Array<{
    cityId: string;
    cityName: string;
    cityLat: string | null;
    cityLng: string | null;
    stateId: string;
    stateName: string;
    stateCode: string | null;
    countryId: number;
    countryName: string;
    countryIso2: string;
  }>;

  const hits = cityHits.map((r) => ({
    label: [r.cityName, r.stateCode ?? r.stateName, r.countryIso2].filter(Boolean).join(", "),
    placeType: "place",
    countryId: r.countryId,
    stateId: r.stateId,
    cityId: r.cityId,
    postalCode: null as string | null,
    latitude: r.cityLat ? Number(r.cityLat) : null,
    longitude: r.cityLng ? Number(r.cityLng) : null,
  }));

  return c.json(success(hits), 200);
});

locationRoutes.get("/reverse", async (c) => {
  const lat = Number(c.req.query("lat"));
  const lng = Number(c.req.query("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "lat and lng required" } }, 400);
  }
  const env = (c.env ?? {}) as Record<string, string | undefined>;
  const deps = buildApiDeps(env);
  const service = new LocationService(deps);
  const place = await deps.geocoder.reverse(lat, lng);
  if (!place) return c.json(success(null), 200);
  const resolved = await service.ensureGeocodedPlace(place);
  return c.json(
    success({
      label: place.label,
      placeType: place.placeType,
      countryId: resolved.countryId,
      stateId: resolved.stateId,
      cityId: resolved.cityId,
      postalCode: resolved.postalCode,
      latitude: resolved.latitude,
      longitude: resolved.longitude,
    }),
    200,
  );
});

// ─── Set / replace locations for an entity ──────────────────────────────
// One generic endpoint that every content type calls after its own save
// succeeds. Auth model: the caller must own the entity. Ownership rules
// per kind are spelled out in `assertOwnership` below — kept inline
// because the rules differ enough that a generic "owner column" wouldn't
// be safe (talent_pool_candidates' owner is the recruiter, not the
// candidate; user_profile's owner is the user themselves; etc.).
async function assertOwnership(
  kind: ContentLocationKind,
  entityId: string,
  userId: string,
): Promise<"ok" | "not_found" | "forbidden"> {
  const db = getDb();

  const own = async <T extends { id: string; userId?: string | null; postedByUserId?: string | null; creatorId?: string | null; ownerId?: string | null }>(
    rows: T[],
    pickOwner: (r: T) => string | null | undefined,
  ): Promise<"ok" | "not_found" | "forbidden"> => {
    const row = rows[0];
    if (!row) return "not_found";
    const ownerId = pickOwner(row);
    if (!ownerId) return "forbidden";
    return ownerId === userId ? "ok" : "forbidden";
  };

  switch (kind) {
    case "job": {
      const rows = await db.select({ id: jobItems.id, postedByUserId: jobItems.postedByUserId }).from(jobItems).where(eq(jobItems.id, entityId)).limit(1);
      return own(rows as any, (r) => r.postedByUserId);
    }
    case "resume": {
      const rows = await db.select({ id: resumeInformation.id, userId: resumeInformation.userId }).from(resumeInformation).where(eq(resumeInformation.id, entityId)).limit(1);
      return own(rows as any, (r) => r.userId);
    }
    case "video": {
      const rows = await db.select({ id: videos.id, userId: videos.userId }).from(videos).where(eq(videos.id, entityId)).limit(1);
      return own(rows as any, (r) => r.userId);
    }
    case "voice": {
      const rows = await db.select({ id: studioVoiceClones.id, userId: studioVoiceClones.userId }).from(studioVoiceClones).where(eq(studioVoiceClones.id, entityId)).limit(1);
      return own(rows as any, (r) => r.userId);
    }
    case "template": {
      const rows = await db.select({ id: studioTemplates.id, creatorId: studioTemplates.creatorId }).from(studioTemplates).where(eq(studioTemplates.id, entityId)).limit(1);
      return own(rows as any, (r) => r.creatorId);
    }
    case "article": {
      const rows = await db.select({ id: articles.id, userId: articles.userId }).from(articles).where(eq(articles.id, entityId)).limit(1);
      return own(rows as any, (r) => r.userId);
    }
    case "service": {
      const rows = await db.select({ id: serviceOfferings.id, userId: serviceOfferings.userId }).from(serviceOfferings).where(eq(serviceOfferings.id, entityId)).limit(1);
      return own(rows as any, (r) => r.userId);
    }
    case "user_profile": {
      // The "entity_id" for user_profile is the user_id itself
      // (matches the backfill in migration 0109). User can only edit
      // their own home location.
      return entityId === userId ? "ok" : "forbidden";
    }
    case "company": {
      const rows = await db.select({ id: companyProfiles.id, ownerId: companyProfiles.ownerId }).from(companyProfiles).where(eq(companyProfiles.id, entityId)).limit(1);
      return own(rows as any, (r) => r.ownerId);
    }
    case "talent_pool_candidate": {
      // Recruiter who owns the candidate pool row gets to tag.
      const rows = await db.select({ id: talentPoolCandidates.id, recruiterId: (talentPoolCandidates as any).recruiterId }).from(talentPoolCandidates).where(eq(talentPoolCandidates.id, entityId)).limit(1);
      return own(rows as any, (r: any) => r.recruiterId);
    }
    default:
      return "forbidden";
  }
}

locationRoutes.post("/entities/:kind/:id", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const kindParam = c.req.param("kind") as ContentLocationKind;
  if (!CONTENT_LOCATION_KINDS.includes(kindParam)) {
    return c.json(error("VALIDATION_ERROR", `Unknown entity kind: ${kindParam}`), 400);
  }
  const entityId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = ContentLocationSetSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      error("VALIDATION_ERROR", "Invalid location payload", { issues: parsed.error.flatten() }),
      400,
    );
  }

  const ownership = await assertOwnership(kindParam, entityId, userId);
  if (ownership === "not_found") return c.json(error("NOT_FOUND", "Entity not found"), 404);
  if (ownership === "forbidden") return c.json(error("FORBIDDEN", "Not your entity"), 403);

  const env = (c.env ?? {}) as Record<string, string | undefined>;
  const deps = buildApiDeps(env);
  const svc = new LocationService(deps);
  await svc.setForEntity(kindParam, entityId, parsed.data);
  const resolved = await svc.getForEntity(kindParam, entityId);
  return c.json(success(resolved), 200);
});

locationRoutes.get("/entities/:kind/:id", async (c) => {
  const kindParam = c.req.param("kind") as ContentLocationKind;
  if (!CONTENT_LOCATION_KINDS.includes(kindParam)) {
    return c.json(error("VALIDATION_ERROR", `Unknown entity kind: ${kindParam}`), 400);
  }
  const entityId = c.req.param("id");
  const env = (c.env ?? {}) as Record<string, string | undefined>;
  const deps = buildApiDeps(env);
  const svc = new LocationService(deps);
  const resolved = await svc.getForEntity(kindParam, entityId);
  return c.json(success(resolved), 200);
});

locationRoutes.all("*", (c) =>
  c.json(
    {
      success: false,
      error: { code: "NOT_FOUND", message: "Location route not found" },
      timestamp: new Date().toISOString(),
    },
    404,
  ),
);
