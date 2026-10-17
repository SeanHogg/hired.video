import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  serial,
  char,
  doublePrecision,
  integer,
  bigint,
  date,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const countries = pgTable("countries", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  iso2: char("iso2", { length: 2 }).notNull().unique(),
  iso3: char("iso3", { length: 3 }).unique(),
  phoneCode: varchar("phone_code", { length: 20 }),
  currency: varchar("currency", { length: 10 }),
  // Demographic columns added by #0166 — backfilled lazily from the
  // GeoNames cities500 import job (deferred). Null until backfilled;
  // page templates fall back to density-based ranking when absent.
  population: bigint("population", { mode: "number" }),
  populationAsOf: date("population_as_of"),
  populationSource: varchar("population_source", { length: 32 }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("countries_population_desc_idx").on(t.population.desc().nullsLast()).where(sql`"population" IS NOT NULL`),
]);

export type Country = typeof countries.$inferSelect;
export type NewCountry = typeof countries.$inferInsert;

export const stateProvinces = pgTable(
  "state_provinces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    countryId: serial("country_id").notNull().references(() => countries.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    code: varchar("code", { length: 10 }),
    // Demographic columns added by #0166.
    population: bigint("population", { mode: "number" }),
    populationAsOf: date("population_as_of"),
    populationSource: varchar("population_source", { length: 32 }),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("state_provinces_population_desc_idx").on(t.population),
    // Added by #0167 — dedupe + prevent the seed from re-inserting
    // duplicate states (it had no conflict target before this).
    uniqueIndex("state_provinces_country_lname_uniq").on(
      t.countryId,
      sql`lower(${t.name})`,
    ),
    index("idx_state_provinces_country_id").on(t.countryId),
  ],
);

export type StateProvince = typeof stateProvinces.$inferSelect;
export type NewStateProvince = typeof stateProvinces.$inferInsert;

export const cities = pgTable(
  "cities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stateId: uuid("state_id").notNull().references(() => stateProvinces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    // URL-safe slug — UNIQUE per (state_id, slug). Backfilled by #0166
    // from slugified name; disambiguates duplicates within a state.
    slug: varchar("slug", { length: 64 }).notNull(),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    // Demographic + cross-dataset anchor columns added by #0166.
    population: integer("population"),
    populationAsOf: date("population_as_of"),
    populationSource: varchar("population_source", { length: 32 }),
    timezone: varchar("timezone", { length: 48 }),
    geonameId: integer("geoname_id"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("cities_state_slug_uniq").on(t.stateId, t.slug),
    uniqueIndex("cities_geoname_id_uniq").on(t.geonameId),
    index("cities_population_desc_idx").on(t.population),
    // pg_trgm GIN — backs the `ILIKE 'q%'` city typeahead (0495).
    index("idx_cities_name_trgm").using("gin", t.name.op("gin_trgm_ops")),
  ],
);

export type City = typeof cities.$inferSelect;
export type NewCity = typeof cities.$inferInsert;


