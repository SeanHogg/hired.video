/**
 * content_locations — polymorphic geo tags shared across every content type.
 *
 * See migration 0108_content_locations.sql for the design rationale.
 * A single row attaches one country / state / city / lat-lng / radius to one
 * (entity_kind, entity_id) tuple. Two roles:
 *   - 'origin' — the canonical place; 0 or 1 per entity (DB-enforced via
 *     a partial unique index)
 *   - 'serves' — additional audience target regions; 0..N per entity
 *
 * Keep CONTENT_LOCATION_KINDS in sync with shared/content-locations.ts —
 * the shared module is the SSoT for the discriminator enum so the frontend
 * + backend can't drift.
 */
import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  doublePrecision,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { countries, stateProvinces, cities } from "./locations.js";

export const contentLocations = pgTable(
  "content_locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    entityKind: varchar("entity_kind", { length: 32 }).notNull(),
    entityId: uuid("entity_id").notNull(),

    role: varchar("role", { length: 16 }).default("origin").notNull(),

    countryId: integer("country_id").references(() => countries.id, {
      onDelete: "set null",
    }),
    stateId: uuid("state_id").references(() => stateProvinces.id, {
      onDelete: "set null",
    }),
    cityId: uuid("city_id").references(() => cities.id, {
      onDelete: "set null",
    }),

    postalCode: varchar("postal_code", { length: 20 }),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),

    radiusKm: integer("radius_km"),
    label: varchar("label", { length: 255 }),
    isRemote: boolean("is_remote").default(false).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("content_locations_entity_idx").on(t.entityKind, t.entityId),
    index("content_locations_kind_country_idx").on(t.entityKind, t.countryId),
    index("content_locations_kind_state_idx").on(t.entityKind, t.stateId),
    index("content_locations_kind_city_idx").on(t.entityKind, t.cityId),
    index("content_locations_kind_latlng_idx").on(
      t.entityKind,
      t.latitude,
      t.longitude,
    ),
    uniqueIndex("content_locations_one_origin_per_entity")
      .on(t.entityKind, t.entityId)
      .where(sql`${t.role} = 'origin'`),
  ],
);

export type ContentLocation = typeof contentLocations.$inferSelect;
export type NewContentLocation = typeof contentLocations.$inferInsert;
