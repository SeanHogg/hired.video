import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";

// ---------------------------------------------------------------------------
// Impersonation sessions
// ---------------------------------------------------------------------------
export const impersonationSessions = pgTable("impersonation_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  superAdminId: uuid("super_admin_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  targetUserId: uuid("target_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenId: text("token_id").notNull().unique(), // jti claim in the JWT
  reason: text("reason").notNull(),
  debuggerEnabled: boolean("debugger_enabled").default(false).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  endReason: varchar("end_reason", { length: 50 }), // 'manual' | 'expired' | 'admin_logout'
  pagesVisited: jsonb("pages_visited").$type<string[]>().default([]),
  writeBlockCount: integer("write_block_count").default(0).notNull(),
}, (t) => [
  index("idx_impersonation_sessions_admin").on(t.superAdminId),
  index("idx_impersonation_sessions_target").on(t.targetUserId),
  index("idx_impersonation_sessions_active").on(t.superAdminId).where(sql`ended_at IS NULL`),
]);

export type ImpersonationSession = typeof impersonationSessions.$inferSelect;
export type NewImpersonationSession = typeof impersonationSessions.$inferInsert;

// ---------------------------------------------------------------------------
// In-session role switches
// ---------------------------------------------------------------------------
export const impersonationRoleSwitches = pgTable("impersonation_role_switches", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => impersonationSessions.id, { onDelete: "cascade" }),
  fromRole: varchar("from_role", { length: 100 }).notNull(),
  toRole: varchar("to_role", { length: 100 }).notNull(),
  switchedAt: timestamp("switched_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_impersonation_role_switches_session_id").on(t.sessionId),
]);

export type ImpersonationRoleSwitch = typeof impersonationRoleSwitches.$inferSelect;
export type NewImpersonationRoleSwitch = typeof impersonationRoleSwitches.$inferInsert;

// ---------------------------------------------------------------------------
// Modules (feature bundles)
// ---------------------------------------------------------------------------
export const modules = pgTable("modules", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull().unique(),
  slug: varchar("slug", { length: 200 }).notNull().unique(),
  description: text("description"),
  requiredRole: varchar("required_role", { length: 100 }).notNull(),
  planTier: varchar("plan_tier", { length: 50 }).default("free").notNull(),
  permissions: jsonb("permissions").$type<string[]>().default([]),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Module = typeof modules.$inferSelect;
export type NewModule = typeof modules.$inferInsert;

// ---------------------------------------------------------------------------
// User module assignments
// ---------------------------------------------------------------------------
export const userModuleAssignments = pgTable("user_module_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  moduleId: uuid("module_id").notNull().references(() => modules.id, { onDelete: "cascade" }),
  assignedBy: uuid("assigned_by").references(() => users.id, { onDelete: "set null" }),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (t) => [
  index("idx_user_module_assignments_user").on(t.userId),
  index("idx_user_module_assignments_assigned_by").on(t.assignedBy),
  index("idx_user_module_assignments_module_id").on(t.moduleId),
]);

export type UserModuleAssignment = typeof userModuleAssignments.$inferSelect;
export type NewUserModuleAssignment = typeof userModuleAssignments.$inferInsert;

// ---------------------------------------------------------------------------
// Per-user permission overrides
// ---------------------------------------------------------------------------
export const userPermissionOverrides = pgTable("user_permission_overrides", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  permissionKey: varchar("permission_key", { length: 200 }).notNull(),
  granted: boolean("granted").default(true).notNull(),
  source: varchar("source", { length: 200 }).notNull(), // 'module:<id>' | 'direct'
  grantedBy: uuid("granted_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_user_permission_overrides_user").on(t.userId),
  index("idx_user_permission_overrides_granted_by").on(t.grantedBy),
]);

export type UserPermissionOverride = typeof userPermissionOverrides.$inferSelect;
export type NewUserPermissionOverride = typeof userPermissionOverrides.$inferInsert;

// ---------------------------------------------------------------------------
// Per-user plan overrides — SuperAdmin "admin override"
// ---------------------------------------------------------------------------
// Sidecar to the real `subscriptions` row. Lets staff comp a plan or raise
// the monthly token limit without mutating Stripe-backed state. One row per
// user (user_id PK). The resolver in domains/planOverride/resolver.ts owns
// the "is this still active?" decision; this table is the raw record.
//
// Encoding:
//   • plan_slug IS NULL  → keep subscription plan, only token-limit is
//                          overridden.
//   • plan_slug = "free"|"pro"|"unlimited" → effective plan override.
//   • monthly_token_limit IS NULL → use plan default.
//   • monthly_token_limit = -1    → unlimited (sentinel; zero is a valid
//                                   real value meaning "no tokens allowed").
//   • expires_at IS NULL → permanent.
export const userPlanOverrides = pgTable("user_plan_overrides", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  planSlug: varchar("plan_slug", { length: 50 }),
  monthlyTokenLimit: integer("monthly_token_limit"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  reason: text("reason").notNull(),
  grantedBy: uuid("granted_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  grantedAt: timestamp("granted_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("user_plan_overrides_expires_at_idx").on(t.expiresAt).where(sql`"expires_at" IS NOT NULL`),
  index("user_plan_overrides_granted_by_idx").on(t.grantedBy),
]);

export type UserPlanOverride = typeof userPlanOverrides.$inferSelect;
export type NewUserPlanOverride = typeof userPlanOverrides.$inferInsert;

// ---------------------------------------------------------------------------
// Admin audit log (append-only)
// ---------------------------------------------------------------------------
export const adminAuditLog = pgTable("admin_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Nullable + ON DELETE SET NULL so audit history survives a hard-delete
  // of the acting user (e.g. spammer cleanup). See migration 0029.
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  impersonationSessionId: uuid("impersonation_session_id").references(() => impersonationSessions.id),
  action: varchar("action", { length: 200 }).notNull(),
  targetType: varchar("target_type", { length: 50 }), // 'user' | 'role' | 'module' | 'tenant'
  targetId: text("target_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_admin_audit_log_actor").on(t.actorId),
  index("idx_admin_audit_log_target").on(t.targetId),
  index("idx_admin_audit_log_created").on(t.createdAt.desc().nullsFirst()),
  index("idx_admin_audit_log_actor_created").on(t.actorId, t.createdAt.desc().nullsFirst()).where(sql`actor_id IS NOT NULL`),
  index("idx_admin_audit_log_impersonation_session_id").on(t.impersonationSessionId),
]);

export type AdminAuditLog = typeof adminAuditLog.$inferSelect;
export type NewAdminAuditLog = typeof adminAuditLog.$inferInsert;
