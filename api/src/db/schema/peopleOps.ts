/**
 * People Operations (CHRO) domain — the embeddable, multi-tenant
 * employer product. Implements the Tenant→Segment→Entity isolation model
 * from specs/hired-video/01-domain-model.md.
 *
 *   Tenant   — a consumer of the CHRO product. The native hired.video
 *              product is the `self` tenant; external embedders get their
 *              own tenant row (kind='embedded').
 *   Segment  — the isolation unit inside a tenant. A native employer maps
 *              to exactly one Segment per hired.video company.
 *   Entity   — every business row below carries (tenant_id, segment_id)
 *              and is resolved through resolveSegment() before any read.
 *
 * Phase 1 (this slice): the Employee spine, 1:1 sessions, and the
 * canonical ActionItem. Later phases add objectives, pulse, syncs,
 * scorecards, workflows, TCO, headcount, PTO (see the gap register).
 *
 * Conventions: see api/drizzle/CONVENTIONS.md. Money is stored as
 * `*_cents` bigint (never numeric); enums are CHECK-constrained from
 * shared/people-ops.ts; every list index leads on (tenant_id, segment_id).
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  integer,
  bigint,
  doublePrecision,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { companyProfiles } from "./companies.js";
import { users, accountInvitations } from "./users.js";
import type { OneOnOneAgendaItem, KeyResult } from "../../../../shared/people-ops.js";

// ── Tenancy ──────────────────────────────────────────────────────────────
export const peopleTenants = pgTable(
  "people_tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 64 }).notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    // self | embedded | direct  (CHECK from shared/people-ops.ts TENANT_KINDS)
    kind: varchar("kind", { length: 16 }).notNull().default("self"),
    // OIDC issuer for an embedded tenant's IdP (e.g. BurnRateOS). Null for self.
    idpIssuer: varchar("idp_issuer", { length: 255 }),
    // active | suspended
    status: varchar("status", { length: 16 }).notNull().default("active"),
    settings: jsonb("settings").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
);

export type PeopleTenant = typeof peopleTenants.$inferSelect;
export type NewPeopleTenant = typeof peopleTenants.$inferInsert;

export const peopleSegments = pgTable(
  "people_segments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => peopleTenants.id, { onDelete: "cascade" }),
    // Native link: the resolved hired.video company this segment isolates.
    // Null only for purely-external embedded segments that haven't been
    // mapped to a local company.
    companyId: uuid("company_id").references(() => companyProfiles.id, {
      onDelete: "set null",
    }),
    // The embedder's identity pair. For a native segment these mirror the
    // company (ownerId, companyId) as text so the unique key is uniform
    // across native + embedded tenants.
    externalAccountId: varchar("external_account_id", { length: 128 }).notNull(),
    externalCompanyId: varchar("external_company_id", { length: 128 }).notNull(),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    // free | starter | team | pro | enterprise — mirrors the host plan;
    // drives the paid entitlement gate.
    plan: varchar("plan", { length: 32 }).notNull().default("free"),
    // active | suspended | archived
    status: varchar("status", { length: 16 }).notNull().default("active"),
    settings: jsonb("settings").$type<Record<string, unknown>>().default({}).notNull(),
    provisionedAt: timestamp("provisioned_at", { withTimezone: true }).defaultNow().notNull(),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // No customer's data bleeds: a (tenant, account, company) triple maps
    // to exactly one Segment.
    uqIdentity: uniqueIndex("uq_people_segments_identity").on(
      t.tenantId,
      t.externalAccountId,
      t.externalCompanyId,
    ),
    byCompany: index("idx_people_segments_company").on(t.companyId),
    byTenantStatus: index("idx_people_segments_tenant_status").on(t.tenantId, t.status),
  }),
);

export type PeopleSegment = typeof peopleSegments.$inferSelect;
export type NewPeopleSegment = typeof peopleSegments.$inferInsert;

// ── Employee spine (roster) ──────────────────────────────────────────────────
// The roster is a SUPERSET of billable seats. A roster row carries ONE of four
// identity links; billability is derived (only an active native user with a
// company association counts as a seat — see services/people-ops, never bumps
// seats here):
//   • userId          — a native hired.video login (the billable path)
//   • invitationId     — a pending native account invitation (not yet a user)
//   • externalUserId   — a federated identity that lives in the CONSUMING
//                        product (embedded tenant); visible per-segment, never
//                        billable. This is the spec's IdentityCache, inlined.
//   • (all null)       — a placeholder the employer tracks but never invites.
// firstName/lastName/email/avatar are a denormalized DISPLAY CACHE (the spec's
// IdentityCache fields); the system of record for native users is `users`, for
// federated users the consuming product.
export const peopleEmployees = pgTable(
  "people_employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => peopleTenants.id, { onDelete: "cascade" }),
    segmentId: uuid("segment_id")
      .notNull()
      .references(() => peopleSegments.id, { onDelete: "cascade" }),

    // ── Identity link (at most one of the three; placeholder when all null) ──
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    invitationId: uuid("invitation_id").references(() => accountInvitations.id, {
      onDelete: "set null",
    }),
    // Federated identity from the embedded consumer (e.g. BurnRateOS user id).
    externalUserId: varchar("external_user_id", { length: 255 }),

    // ── Display cache (SoT is users / the consuming product for linked rows) ──
    firstName: varchar("first_name", { length: 120 }).notNull(),
    lastName: varchar("last_name", { length: 120 }).notNull(),
    email: varchar("email", { length: 320 }), // nullable — federated/placeholder may lack one
    phone: varchar("phone", { length: 40 }),
    position: varchar("position", { length: 200 }).notNull().default(""),
    department: varchar("department", { length: 120 }).notNull().default(""),
    location: varchar("location", { length: 200 }),
    startDate: timestamp("start_date", { withTimezone: true }),
    // canonical kebab employment type — shared/employment-types.ts
    employmentType: varchar("employment_type", { length: 32 }).notNull().default("full-time"),
    // active | inactive | on_leave | terminated
    status: varchar("status", { length: 16 }).notNull().default("active"),
    avatar: text("avatar"),
    skills: jsonb("skills").$type<string[]>().default([]).notNull(),
    notes: text("notes"),

    // Org graph — self-join; org chart is computed from manager_id.
    managerId: uuid("manager_id").references((): AnyPgColumn => peopleEmployees.id, {
      onDelete: "set null",
    }),

    // Performance + comp (unioned from the spec's employees + payroll_records).
    // Money is cents (CONVENTIONS) — spec's Decimal(14,2) maps to bigint cents.
    performanceRating: doublePrecision("performance_rating"),
    salaryCents: bigint("salary_cents", { mode: "number" }),
    equityShares: integer("equity_shares"),

    // Founder flag — drives the BurnRateOS company teamSize/coFounders seam
    // (doc 05 §4.1) once the embed-back layer lands.
    isFounder: boolean("is_founder").notNull().default(false),

    // Provenance: set when this employee was hired through the ATS.
    convertedFromCandidateId: uuid("converted_from_candidate_id"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // One roster row per native user / per federated identity / per email,
    // within a segment. Partial so multiple null-identity placeholders coexist.
    uqUser: uniqueIndex("uq_people_employees_segment_user")
      .on(t.tenantId, t.segmentId, t.userId)
      .where(sql`${t.userId} IS NOT NULL`),
    uqExternal: uniqueIndex("uq_people_employees_segment_external")
      .on(t.tenantId, t.segmentId, t.externalUserId)
      .where(sql`${t.externalUserId} IS NOT NULL`),
    uqEmail: uniqueIndex("uq_people_employees_segment_email")
      .on(t.tenantId, t.segmentId, t.email)
      .where(sql`${t.email} IS NOT NULL`),
    byStatus: index("idx_people_employees_status").on(t.tenantId, t.segmentId, t.status),
    byManager: index("idx_people_employees_manager").on(t.tenantId, t.segmentId, t.managerId),
  }),
);

export type PeopleEmployee = typeof peopleEmployees.$inferSelect;
export type NewPeopleEmployee = typeof peopleEmployees.$inferInsert;

// ── 1-on-1 sessions ─────────────────────────────────────────────────────────
// Native adaptation: supervisor + participant reference the roster
// (people_employees), since the org chart — and thus who runs a 1:1 — is
// built from the roster. The spec modelled these as federated userIds; when
// the embed/federation layer lands they resolve via the IdentityCache.
export const peopleOneOnOnes = pgTable(
  "people_one_on_ones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => peopleTenants.id, { onDelete: "cascade" }),
    segmentId: uuid("segment_id")
      .notNull()
      .references(() => peopleSegments.id, { onDelete: "cascade" }),
    supervisorId: uuid("supervisor_id")
      .notNull()
      .references(() => peopleEmployees.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => peopleEmployees.id, { onDelete: "cascade" }),
    scheduledDate: timestamp("scheduled_date", { withTimezone: true }).notNull(),
    duration: integer("duration").notNull().default(60), // minutes
    // scheduled | completed | cancelled | rescheduled
    status: varchar("status", { length: 16 }).notNull().default("scheduled"),
    // video | phone | in_person | hybrid
    meetingType: varchar("meeting_type", { length: 16 }).notNull().default("video"),
    location: varchar("location", { length: 200 }),
    meetingLink: text("meeting_link"),
    agenda: jsonb("agenda").$type<OneOnOneAgendaItem[]>().default([]).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    bySupervisor: index("idx_people_one_on_ones_supervisor").on(
      t.tenantId,
      t.segmentId,
      t.supervisorId,
    ),
    byParticipant: index("idx_people_one_on_ones_participant").on(
      t.tenantId,
      t.segmentId,
      t.participantId,
    ),
    byDate: index("idx_people_one_on_ones_date").on(t.tenantId, t.segmentId, t.scheduledDate),
  }),
);

export type PeopleOneOnOne = typeof peopleOneOnOnes.$inferSelect;
export type NewPeopleOneOnOne = typeof peopleOneOnOnes.$inferInsert;

// NOTE: the canonical cross-source ActionItem is NOT a bespoke table — it
// reuses the existing personal-task system (`tasks`), extended with
// (tenant_id, segment_id, assignee_employee_id, source_type, one_on_one_id)
// in migration 0186 so a CHRO action item and a personal to-do live in one
// inbox. See schema/productivity.ts + repositories/peopleActionItemsRepository.ts.

// ── Goals / OKRs (PO-4) ──────────────────────────────────────────────────────
// An OKR owned by a roster employee. key_results is an ordered JSON array; the
// goal's progress rolls up from them (computed in the service). Optional
// milestone_id links into the Strategy surface (objectives/milestones, #1814).
export const peopleGoals = pgTable(
  "people_goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => peopleTenants.id, { onDelete: "cascade" }),
    segmentId: uuid("segment_id")
      .notNull()
      .references(() => peopleSegments.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => peopleEmployees.id, { onDelete: "cascade" }),
    // → people_company_milestones (lands with the Strategy surface, #1814).
    milestoneId: uuid("milestone_id"),
    title: varchar("title", { length: 300 }).notNull(),
    description: text("description"),
    // not_started | in_progress | completed | on_hold | blocked | cancelled | at_risk
    status: varchar("status", { length: 16 }).notNull().default("not_started"),
    // low | medium | high | critical
    priority: varchar("priority", { length: 16 }).notNull().default("medium"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    progress: integer("progress").notNull().default(0), // 0–100 (rolled up from key results)
    category: varchar("category", { length: 120 }),
    keyResults: jsonb("key_results").$type<KeyResult[]>().default([]).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byEmployee: index("idx_people_goals_employee").on(t.tenantId, t.segmentId, t.employeeId),
    byStatus: index("idx_people_goals_status").on(t.tenantId, t.segmentId, t.status),
  }),
);

export type PeopleGoal = typeof peopleGoals.$inferSelect;
export type NewPeopleGoal = typeof peopleGoals.$inferInsert;
