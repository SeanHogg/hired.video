/**
 * ContentLocationsRepository — pure data access for the polymorphic
 * content_locations table (migration 0108) and its joined reference
 * data (countries, state_provinces, cities).
 *
 * No business logic — that lives in services/location/LocationService.ts,
 * which also owns the Mapbox geocoder calls + the ensure-on-write logic
 * that inserts new cities discovered via autocomplete.
 */

import { and, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";
import type {
  ContentLocationKind,
  ContentLocationRole,
  ResolvedContentLocation,
} from "../../../shared/content-locations.js";
import { radiusBoundingBox } from "../../../shared/content-locations.js";

const { contentLocations, countries, stateProvinces, cities } = schema;

export type DbLike = any;

export type ContentLocationRow = typeof contentLocations.$inferSelect;
export type ContentLocationInsert = typeof contentLocations.$inferInsert;

export interface SaveLocationInput {
  role?: ContentLocationRole;
  countryId?: number | null;
  stateId?: string | null;
  cityId?: string | null;
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  radiusKm?: number | null;
  label?: string | null;
  isRemote?: boolean;
}

export interface LocationFilterOptions {
  /** Required — narrows the polymorphic table to one entity type. */
  entityKind: ContentLocationKind;
  countryId?: number | null;
  stateId?: string | null;
  cityId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  radiusKm?: number | null;
  remote?: boolean;
}

export interface IContentLocationsRepository {
  /** Replace the full location set for an entity (origin + serves array). */
  replaceForEntity(
    entityKind: ContentLocationKind,
    entityId: string,
    origin: SaveLocationInput | null,
    serves: SaveLocationInput[],
  ): Promise<void>;

  /** Get all locations for an entity, resolved with reference-data joins. */
  findResolvedForEntity(
    entityKind: ContentLocationKind,
    entityId: string,
  ): Promise<ResolvedContentLocation[]>;

  /** Bulk-load locations for many entities. Used by search-result
   *  hydration so cards don't N+1. */
  findResolvedForEntities(
    entityKind: ContentLocationKind,
    entityIds: string[],
  ): Promise<Map<string, ResolvedContentLocation[]>>;

  /** Find the set of entity_ids of `entityKind` that match the filter.
   *  Used by every search route to narrow the result set before joining
   *  back to the entity table. Returns null when no geo filter is set
   *  (signaling "no filter — don't intersect"). */
  matchingEntityIds(opts: LocationFilterOptions): Promise<string[] | null>;
}

export class ContentLocationsRepository implements IContentLocationsRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  async replaceForEntity(
    entityKind: ContentLocationKind,
    entityId: string,
    origin: SaveLocationInput | null,
    serves: SaveLocationInput[],
  ): Promise<void> {
    // The partial unique index on (entity_kind, entity_id) WHERE role='origin'
    // enforces 0..1 origin per entity. Replacing both at once means
    // delete-then-insert so we don't have to upsert by an unstable id.
    await this.db
      .delete(contentLocations)
      .where(
        and(
          eq(contentLocations.entityKind, entityKind),
          eq(contentLocations.entityId, entityId),
        ),
      );

    const rows: ContentLocationInsert[] = [];
    if (origin) {
      rows.push(this.toInsertRow(entityKind, entityId, { ...origin, role: "origin" }));
    }
    for (const serve of serves) {
      rows.push(this.toInsertRow(entityKind, entityId, { ...serve, role: "serves" }));
    }
    if (rows.length > 0) {
      await this.db.insert(contentLocations).values(rows as any);
    }
  }

  async findResolvedForEntity(
    entityKind: ContentLocationKind,
    entityId: string,
  ): Promise<ResolvedContentLocation[]> {
    const map = await this.findResolvedForEntities(entityKind, [entityId]);
    return map.get(entityId) ?? [];
  }

  async findResolvedForEntities(
    entityKind: ContentLocationKind,
    entityIds: string[],
  ): Promise<Map<string, ResolvedContentLocation[]>> {
    const out = new Map<string, ResolvedContentLocation[]>();
    if (entityIds.length === 0) return out;

    const rows = await this.db
      .select({
        loc: contentLocations,
        countryName: countries.name,
        countryIso2: countries.iso2,
        stateName: stateProvinces.name,
        stateCode: stateProvinces.code,
        cityName: cities.name,
      })
      .from(contentLocations)
      .leftJoin(countries, eq(countries.id, contentLocations.countryId))
      .leftJoin(stateProvinces, eq(stateProvinces.id, contentLocations.stateId))
      .leftJoin(cities, eq(cities.id, contentLocations.cityId))
      .where(
        and(
          eq(contentLocations.entityKind, entityKind),
          inArray(contentLocations.entityId, entityIds),
        ),
      );

    for (const r of rows as Array<{
      loc: ContentLocationRow;
      countryName: string | null;
      countryIso2: string | null;
      stateName: string | null;
      stateCode: string | null;
      cityName: string | null;
    }>) {
      const resolved: ResolvedContentLocation = {
        id: r.loc.id,
        entityKind: r.loc.entityKind as ContentLocationKind,
        entityId: r.loc.entityId,
        role: r.loc.role as ContentLocationRole,
        countryId: r.loc.countryId ?? null,
        countryName: r.countryName,
        countryIso2: r.countryIso2,
        stateId: r.loc.stateId ?? null,
        stateName: r.stateName,
        stateCode: r.stateCode,
        cityId: r.loc.cityId ?? null,
        cityName: r.cityName,
        postalCode: r.loc.postalCode ?? null,
        latitude: r.loc.latitude ?? null,
        longitude: r.loc.longitude ?? null,
        radiusKm: r.loc.radiusKm ?? null,
        label: r.loc.label ?? null,
        isRemote: r.loc.isRemote,
      };
      const list = out.get(r.loc.entityId);
      if (list) list.push(resolved);
      else out.set(r.loc.entityId, [resolved]);
    }
    return out;
  }

  async matchingEntityIds(opts: LocationFilterOptions): Promise<string[] | null> {
    const hasGeoFilter =
      opts.countryId != null ||
      opts.stateId != null ||
      opts.cityId != null ||
      (opts.latitude != null && opts.longitude != null) ||
      typeof opts.remote === "boolean";

    if (!hasGeoFilter) return null;

    const conds: any[] = [eq(contentLocations.entityKind, opts.entityKind)];

    // City is the narrowest match — but a city in WA also matches when
    // the viewer filtered by WA. So we filter inclusively up the
    // hierarchy: city OR state OR country, whichever was supplied.
    if (opts.cityId != null) {
      conds.push(eq(contentLocations.cityId, opts.cityId));
    } else if (opts.stateId != null) {
      conds.push(eq(contentLocations.stateId, opts.stateId));
    } else if (opts.countryId != null) {
      conds.push(eq(contentLocations.countryId, opts.countryId));
    }

    if (opts.latitude != null && opts.longitude != null && opts.radiusKm != null) {
      const bbox = radiusBoundingBox(opts.latitude, opts.longitude, opts.radiusKm);
      conds.push(
        sql`${contentLocations.latitude} BETWEEN ${bbox.minLat} AND ${bbox.maxLat}`,
      );
      conds.push(
        sql`${contentLocations.longitude} BETWEEN ${bbox.minLng} AND ${bbox.maxLng}`,
      );
    }

    if (opts.remote === true) {
      conds.push(eq(contentLocations.isRemote, true));
    } else if (opts.remote === false) {
      conds.push(eq(contentLocations.isRemote, false));
    }

    const rows = (await this.db
      .selectDistinct({ entityId: contentLocations.entityId })
      .from(contentLocations)
      .where(and(...conds))
      .limit(5000)) as Array<{ entityId: string }>;

    return rows.map((r) => r.entityId);
  }

  private toInsertRow(
    entityKind: ContentLocationKind,
    entityId: string,
    input: SaveLocationInput,
  ): ContentLocationInsert {
    return {
      entityKind,
      entityId,
      role: input.role ?? "origin",
      countryId: input.countryId ?? null,
      stateId: input.stateId ?? null,
      cityId: input.cityId ?? null,
      postalCode: input.postalCode ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      radiusKm: input.radiusKm ?? null,
      label: input.label ?? null,
      isRemote: input.isRemote ?? false,
      createdAt: this.now(),
      updatedAt: this.now(),
    } as ContentLocationInsert;
  }
}

// ---------------------------------------------------------------------------
// Map pins (/api/map): entities whose `origin` location has lat/lng inside a
// bounding box. Events (entity_kind 'event') and people (entity_kind
// 'user_profile', entity_id = users.id — the home location, mig 0631).
// ---------------------------------------------------------------------------

export interface PinBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

function originInBox(box: PinBox) {
  return and(
    eq(contentLocations.role, "origin"),
    isNotNull(contentLocations.latitude),
    isNotNull(contentLocations.longitude),
    gte(contentLocations.latitude, box.minLat),
    lte(contentLocations.latitude, box.maxLat),
    gte(contentLocations.longitude, box.minLng),
    lte(contentLocations.longitude, box.maxLng),
  );
}

/** Public, non-cancelled, upcoming events (type event/coffee) pinned in the box (max 500). */
export async function listEventPinsInBox(db: Db, box: PinBox, now: Date) {
  const { scheduledEvents } = schema;
  return db
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
      and(eq(contentLocations.entityKind, "event"), eq(contentLocations.entityId, scheduledEvents.id)),
    )
    .where(
      and(
        eq(scheduledEvents.visibility, "public"),
        gte(scheduledEvents.startAt, now),
        sql`${scheduledEvents.cancelledAt} IS NULL`,
        sql`${scheduledEvents.type} IN ('event', 'coffee')`,
        originInBox(box),
      ),
    )
    .limit(500);
}

/** Public, verified users whose home location is in the box (max 500), with
 *  their profileSections + role so the caller applies the openToCoffee rule. */
export async function listPeoplePinsInBox(db: Db, box: PinBox) {
  const { users, userProfiles } = schema;
  return db
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
      avatarUrl: userProfiles.avatarUrl,
      headline: userProfiles.headline,
      lat: contentLocations.latitude,
      lng: contentLocations.longitude,
      sections: userProfiles.profileSections,
      profileVisibility: userProfiles.profileVisibility,
    })
    .from(users)
    .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
    .innerJoin(
      contentLocations,
      and(eq(contentLocations.entityKind, "user_profile"), eq(contentLocations.entityId, users.id)),
    )
    .where(
      and(
        eq(userProfiles.profileVisibility, "public"),
        eq(users.emailVerified, true),
        originInBox(box),
      ),
    )
    .limit(500);
}
