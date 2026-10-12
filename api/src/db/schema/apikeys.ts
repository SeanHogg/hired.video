import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  // Stores only first 8 chars (prefix) for display; full key shown once at creation only
  keyPrefix: varchar("key_prefix", { length: 12 }).notNull(),
  // SHA-256 hex hash of the full key — used for validation
  keyHash: text("key_hash").notNull(),
  scopes: jsonb("scopes").default([]).notNull(), // e.g. ["read:resumes", "write:jobs"]
  isActive: boolean("is_active").default(true).notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // Auth lookup by SHA-256 of a random key (0495). Unique is safe — the hash
  // of a 256-bit random secret can't collide; see 0495 for the dup guard.
  uniqueIndex("uq_api_keys_key_hash").on(t.keyHash),
  index("idx_api_keys_user").on(t.userId),
]);

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
