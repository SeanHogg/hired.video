/**
 * role_feature_access — SuperAdmin per-role overrides for the Feature Registry
 * (see shared/feature-registry.ts + shared/role-access.ts).
 *
 * Stores ONLY deltas from the code-defined defaults: one row per (role,
 * feature_key) that differs. NULL columns inherit the registry default, so an
 * empty table reproduces today's behaviour exactly (zero regression), and
 * "reset role to defaults" is just deleting that role's rows.
 *
 * See migration 0214_role_feature_access.sql.
 */
import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const roleFeatureAccess = pgTable(
  "role_feature_access",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // USER_ROLES value the override targets.
    role: varchar("role", { length: 50 }).notNull(),
    // FeatureRegistryEntry.key, e.g. "nav:studio".
    featureKey: varchar("feature_key", { length: 200 }).notNull(),

    // Tri-state overrides — NULL = inherit the registry default for this role.
    visible: boolean("visible"),
    enabled: boolean("enabled"),
    rank: integer("rank"),

    updatedBy: uuid("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // One override row per (role, feature) — upsert target.
    uniqueIndex("uq_role_feature_access").on(t.role, t.featureKey),
    index("idx_role_feature_access_role").on(t.role),
  ],
);

export type RoleFeatureAccess = typeof roleFeatureAccess.$inferSelect;
export type NewRoleFeatureAccess = typeof roleFeatureAccess.$inferInsert;
