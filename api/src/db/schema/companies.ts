import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  integer,
  numeric,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";

/** Structured benefits offered by a company. Boolean flags for the common
 *  items + a free-form `other` array for anything else (e.g. "Pet health
 *  insurance", "Annual retreat"). Stored as a single jsonb column on
 *  company_profiles rather than a normalised table to match how the UI
 *  renders (one toggle grid) and keep writes cheap. */
export interface CompanyBenefits {
  healthInsurance?: boolean;
  dentalInsurance?: boolean;
  visionInsurance?: boolean;
  retirement401k?: boolean;
  retirementPlan?: boolean;
  stockOptions?: boolean;
  paidTimeOff?: boolean;
  parentalLeave?: boolean;
  flexibleSchedule?: boolean;
  remoteWork?: boolean;
  learningBudget?: boolean;
  professionalDevelopment?: boolean;
  gymMembership?: boolean;
  freeFood?: boolean;
  commuteBenefits?: boolean;
  other?: string[];
}

/** Structured headquarters address. The `description` (free-text) used to
 *  live in `headquarters` as a varchar; migration 0074 promoted the column
 *  to jsonb and split into structured fields the UI was already submitting. */
export interface CompanyHeadquarters {
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  timezone?: string;
  remote?: boolean;
}

/** Structured external-contact channels. Migration 0074 added this column
 *  so contact info submitted by CompanyBuilder finally has somewhere to land. */
export interface CompanyContact {
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  linkedin?: string | null;
  twitter?: string | null;
  facebook?: string | null;
}

export const companyProfiles = pgTable("company_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).unique(),
  description: text("description"),
  website: varchar("website", { length: 500 }),
  logoUrl: text("logo_url"),
  industry: varchar("industry", { length: 100 }),
  size: varchar("size", { length: 50 }),
  foundedYear: integer("founded_year"),
  // Structured HQ — migration 0074 promoted from varchar(255). Legacy
  // free-text rows now live under `address`. The companyLocations table
  // still owns multi-office metadata; this column is the canonical primary.
  headquarters: jsonb("headquarters").$type<CompanyHeadquarters | null>(),
  // External contact channels — email, phone, social. Added by migration
  // 0074. Defaults to {} so reads always have an object to spread.
  contact: jsonb("contact").$type<CompanyContact>().default({}).notNull(),
  // Short marketing pitch ("AI-native resume tooling for recruiters"). Max
  // ~120 chars of copy to keep cards tidy.
  tagline: varchar("tagline", { length: 255 }),
  // Long-form mission / vision statements. Editors render as markdown.
  mission: text("mission"),
  vision: text("vision"),
  // Flat string arrays, stored inline for cheap reads. Orderable by the
  // editor; serialized as-is on the DTO.
  technologies: jsonb("technologies").$type<string[]>().default([]).notNull(),
  perks: jsonb("perks").$type<string[]>().default([]).notNull(),
  culture: jsonb("culture").$type<string[]>().default([]).notNull(),
  values: jsonb("values").$type<string[]>().default([]).notNull(),
  // Structured benefits — see CompanyBenefits type above.
  benefits: jsonb("benefits").$type<CompanyBenefits>().default({}).notNull(),
  isVerified: boolean("is_verified").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  // gap #107 — self-serve featured company profile boost
  featured: boolean("featured").default(false).notNull(),
  featuredUntil: timestamp("featured_until", { withTimezone: true }),
  featuredRankBoost: integer("featured_rank_boost").default(0).notNull(),
  // Denormalized review aggregate — recomputed by
  // recomputeAggregateCache() in api/src/routes/reviews.ts on every
  // review write/delete. Avoids re-scanning the polymorphic `reviews`
  // table on every directory / card / OG render. See migration 0035.
  reviewCount: integer("review_count").notNull().default(0),
  reviewAvgOverall: numeric("review_avg_overall", { precision: 3, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type CompanyProfile = typeof companyProfiles.$inferSelect;
export type NewCompanyProfile = typeof companyProfiles.$inferInsert;

export const userCompanyRoleAssociations = pgTable("user_company_role_associations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  companyId: uuid("company_id").notNull().references(() => companyProfiles.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 100 }).notNull().default("member"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type UserCompanyRoleAssociation = typeof userCompanyRoleAssociations.$inferSelect;
export type NewUserCompanyRoleAssociation = typeof userCompanyRoleAssociations.$inferInsert;

export const companyFollowers = pgTable("company_followers", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  companyId: uuid("company_id").notNull().references(() => companyProfiles.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type CompanyFollower = typeof companyFollowers.$inferSelect;
export type NewCompanyFollower = typeof companyFollowers.$inferInsert;

// ---------------------------------------------------------------------------
// Company locations — a company can have multiple offices/sites. The primary
// HQ stored on `company_profiles.headquarters` is a denormalised display
// string; structured addresses live here so we can render them on cards and
// use them for job-location filtering.
// ---------------------------------------------------------------------------

export const companyLocations = pgTable("company_locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companyProfiles.id, { onDelete: "cascade" }),
  label: varchar("label", { length: 100 }),  // "HQ", "Engineering Office", etc.
  address: varchar("address", { length: 255 }),
  city: varchar("city", { length: 100 }),
  region: varchar("region", { length: 100 }),
  postalCode: varchar("postal_code", { length: 20 }),
  countryCode: varchar("country_code", { length: 8 }),
  isPrimary: boolean("is_primary").default(false).notNull(),
  displayOrder: integer("display_order").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("company_locations_company_id_idx").on(table.companyId),
]);

export type CompanyLocation = typeof companyLocations.$inferSelect;
export type NewCompanyLocation = typeof companyLocations.$inferInsert;

// ---------------------------------------------------------------------------
// Company team members — surfaced on the company profile. `userId` is
// optional: we support linking real platform users (who may opt-in to show
// their profile) as well as free-form team cards for people without an
// account (e.g. an advisory board member).
// ---------------------------------------------------------------------------

export const companyTeamMembers = pgTable("company_team_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companyProfiles.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  name: varchar("name", { length: 255 }).notNull(),
  title: varchar("title", { length: 255 }),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  linkedinUrl: text("linkedin_url"),
  displayOrder: integer("display_order").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("company_team_members_company_id_idx").on(table.companyId),
  // Enforce one entry per (company, user) when a user is linked — prevents
  // accidental duplicates. NULL userIds are allowed to repeat (multiple
  // unaffiliated team entries are fine).
  uniqueIndex("company_team_members_company_user_unique")
    .on(table.companyId, table.userId)
    .where(sql`user_id IS NOT NULL`),
]);

export type CompanyTeamMember = typeof companyTeamMembers.$inferSelect;
export type NewCompanyTeamMember = typeof companyTeamMembers.$inferInsert;

// ---------------------------------------------------------------------------
// Company view analytics — mirrors resume_views. Non-owner GETs on a
// company profile log a row here; the view count surfaced on the DTO is
// derived by aggregation, not a denormalised counter (same reason as the
// resume events table).
// ---------------------------------------------------------------------------

export const companyViews = pgTable("company_views", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companyProfiles.id, { onDelete: "cascade" }),
  viewerId: uuid("viewer_id").references(() => users.id, { onDelete: "set null" }),
  ipHash: varchar("ip_hash", { length: 64 }),
  referrer: text("referrer"),
  userAgent: text("user_agent"),
  viewedAt: timestamp("viewed_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("company_views_company_id_idx").on(table.companyId),
  index("company_views_viewed_at_idx").on(table.viewedAt),
  // Dashboard "recent views for company X" feed; the per-column indexes
  // covered lookups but forced a sort step on read.
  index("idx_company_views_company_viewed").on(table.companyId, table.viewedAt.desc()),
]);

export type CompanyView = typeof companyViews.$inferSelect;
export type NewCompanyView = typeof companyViews.$inferInsert;

// ─── Employer Branding Pages ──────────────────────────────────────────────────
// Paid add-on: dedicated culture/video branding page beyond basic company profile.

export const employerBrandingPages = pgTable("employer_branding_pages", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companyProfiles.id, { onDelete: "cascade" }).unique(),
  heroVideoUrl: text("hero_video_url"),
  heroHeadline: varchar("hero_headline", { length: 200 }),
  heroSubtitle: text("hero_subtitle"),
  cultureStatement: text("culture_statement"),
  values: jsonb("values").default([]).$type<Array<{ title: string; description: string; emoji?: string }>>(),
  perks: jsonb("perks").default([]).$type<Array<{ title: string; description: string; icon?: string }>>(),
  mediaGallery: jsonb("media_gallery").default([]).$type<Array<{ url: string; type: "image" | "video"; caption?: string }>>(),
  teamHighlights: jsonb("team_highlights").default([]).$type<Array<{ name: string; role: string; quote: string; avatarUrl?: string }>>(),
  awardsAndRecognition: jsonb("awards_and_recognition").default([]).$type<Array<{ title: string; year?: number; imageUrl?: string }>>(),
  primaryColor: varchar("primary_color", { length: 20 }).default("#2563eb"),
  isPublished: boolean("is_published").default(false).notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type EmployerBrandingPage = typeof employerBrandingPages.$inferSelect;
export type NewEmployerBrandingPage = typeof employerBrandingPages.$inferInsert;
