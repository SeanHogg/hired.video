/**
 * geocoder_cache — persistent read-through cache for the Mapbox geocoder
 * (see migration 0110_geocoder_cache.sql for design rationale + key
 * normalization rules).
 *
 * Lives in its own schema file rather than next to content_locations
 * because the cache is a cross-cutting infrastructure concern, not part
 * of the geo-tagging aggregate.
 */
import {
  pgTable,
  varchar,
  jsonb,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const geocoderCache = pgTable(
  "geocoder_cache",
  {
    cacheKey: varchar("cache_key", { length: 300 }).primaryKey(),
    result: jsonb("result"),
    hitCount: integer("hit_count").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastHitAt: timestamp("last_hit_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("geocoder_cache_last_hit_idx").on(t.lastHitAt)],
);

export type GeocoderCacheRow = typeof geocoderCache.$inferSelect;
export type GeocoderCacheInsert = typeof geocoderCache.$inferInsert;
