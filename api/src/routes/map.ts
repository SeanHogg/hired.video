/**
 * /api/map — pin data for the /map discovery page.
 *
 * Returns two pin layers in one request so the page only round-trips
 * once per filter change:
 *   • events: upcoming public events whose origin location has lat/lng,
 *             matching the bbox / radius filter.
 *   • people: users with `openToCoffee` enabled AND a home lat/lng.
 *
 * Geo + radius filter reuses `content_locations` for events (entity_kind
 * = 'event') and `user_profiles.home_latitude/longitude` for people.
 * Per project_globe_details_owner_only.md, the popover drawer on the
 * frontend uses the existing `useEntityDetailsPermission` seam — this
 * endpoint just returns the pin metadata, not the full detail drawer.
 */
import { Hono } from "hono";
import { and, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import type { Variables, AppEnv } from "../types/index.js";
import { success } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { resolveProfileSections } from "../../../shared/profile-sections.js";

const {
  scheduledEvents,
  contentLocations,
  users,
  userProfiles,
} = schema;

export const mapRoutes = new Hono<AppEnv>();

interface PinFilter {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

function parseFilter(c: any): PinFilter | null {
  const minLat = c.req.query("minLat") ? Number(c.req.query("minLat")) : -90;
  const maxLat = c.req.query("maxLat") ? Number(c.req.query("maxLat")) : 90;
  const minLng = c.req.query("minLng") ? Number(c.req.query("minLng")) : -180;
  const maxLng = c.req.query("maxLng") ? Number(c.req.query("maxLng")) : 180;
  if (
    !Number.isFinite(minLat) ||
    !Number.isFinite(maxLat) ||
    !Number.isFinite(minLng) ||
    !Number.isFinite(maxLng)
  ) {
    return null;
  }
  return { minLat, maxLat, minLng, maxLng };
}

// ─── GET /api/map — combined pins (events + people) ───────────────────
mapRoutes.get("/", async (c) => {
  const filter = parseFilter(c);
  if (!filter) return c.json(success({ events: [], people: [] }), 200);

  const db = getDb();
  const now = new Date();

  // Events: join scheduledEvents → content_locations for the origin row
  // with lat/lng. Only public, non-cancelled, upcoming-or-current.
  const eventsPromise = db
    .select({
      id: scheduledEvents.id,
      title: scheduledEvents.title,
      slug: scheduledEvents.slug,
      category: scheduledEvents.category,
      eventFormat: scheduledEvents.eventFormat,
      startAt: scheduledEvents.startAt,
      attendeeCount: scheduledEvents.attendeeCount,
      capacity: scheduledEvents.capacity,
      coverImageUrl: scheduledEvents.coverImageUrl,
      lat: contentLocations.latitude,
      lng: contentLocations.longitude,
    })
    .from(scheduledEvents)
    .innerJoin(
      contentLocations,
      and(
        eq(contentLocations.entityKind, "event"),
        eq(contentLocations.entityId, scheduledEvents.id),
        eq(contentLocations.role, "origin"),
      ),
    )
    .where(
      and(
        eq(scheduledEvents.visibility, "public"),
        gte(scheduledEvents.startAt, now),
        sql`${scheduledEvents.cancelledAt} IS NULL`,
        sql`${scheduledEvents.type} IN ('event', 'coffee')`,
        isNotNull(contentLocations.latitude),
        isNotNull(contentLocations.longitude),
        gte(contentLocations.latitude, filter.minLat),
        lte(contentLocations.latitude, filter.maxLat),
        gte(contentLocations.longitude, filter.minLng),
        lte(contentLocations.longitude, filter.maxLng),
      ),
    )
    .limit(500);

  // People: users with home lat/lng AND profileSections.openToCoffee=true.
  // We pull the profileSections JSON + role and apply the resolver
  // post-query (small enough cohort that an in-DB JSON path filter isn't
  // worth the index complexity yet — revisit at 100k+ opted-in users).
  const peoplePromise = db
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
      avatarUrl: userProfiles.avatarUrl,
      headline: userProfiles.headline,
      lat: userProfiles.homeLatitude,
      lng: userProfiles.homeLongitude,
      sections: userProfiles.profileSections,
      profileVisibility: userProfiles.profileVisibility,
    })
    .from(users)
    .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(
      and(
        eq(userProfiles.profileVisibility, "public"),
        eq(users.emailVerified, true),
        isNotNull(userProfiles.homeLatitude),
        isNotNull(userProfiles.homeLongitude),
        gte(userProfiles.homeLatitude, filter.minLat),
        lte(userProfiles.homeLatitude, filter.maxLat),
        gte(userProfiles.homeLongitude, filter.minLng),
        lte(userProfiles.homeLongitude, filter.maxLng),
      ),
    )
    .limit(500);

  const [events, people] = await Promise.all([eventsPromise, peoplePromise]);

  const filteredPeople = people
    .map((p) => {
      const resolved = resolveProfileSections(p.sections as any, p.role);
      if (!resolved.openToCoffee) return null;
      return {
        id: p.id,
        name: p.name,
        role: p.role,
        avatarUrl: p.avatarUrl,
        headline: p.headline,
        lat: p.lat,
        lng: p.lng,
      };
    })
    .filter(Boolean);

  return c.json(
    success({
      events: events.map((e) => ({
        id: e.id,
        title: e.title,
        slug: e.slug,
        category: e.category,
        eventFormat: e.eventFormat,
        startAt: e.startAt.toISOString(),
        attendeeCount: e.attendeeCount,
        capacity: e.capacity,
        coverImageUrl: e.coverImageUrl,
        lat: e.lat,
        lng: e.lng,
      })),
      people: filteredPeople,
    }),
    200,
  );
});

mapRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Map route not found" } }, 404),
);
