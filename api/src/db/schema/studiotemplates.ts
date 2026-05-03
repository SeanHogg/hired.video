/**
 * Studio Template Marketplace — creator-published, buyable video templates.
 *
 * A studio template is a `VideoScript` JSON snapshot (theme, scenes, audio,
 * brand) saved by a creator from one of their own studio projects, with
 * user-specific fields stripped (resumeText, scene text overlays that name
 * the original creator, etc.). Buyers pay once for a license and the
 * template can then be loaded into the studio just like the hard-coded
 * `data/templates/*.json` ones.
 *
 * Tables:
 *   - studio_templates            — listings (one row per published template)
 *   - template_licenses           — polymorphic ownership ledger covering
 *                                   resume / job / studio templates
 *
 * Mirrors the voice-clone marketplace shape (studiofeatures.ts:95) so the
 * publish flow, fee snapshot and slug handling stay consistent across
 * creator surfaces.
 */

import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { companyProfiles } from "./companies.js";

// ---------------------------------------------------------------------------
// Studio Templates — sellable VideoScript snapshots.
// Defaults to `private`. Once `visibility = 'public'` and the creator has
// `videoActive = true` on creator_profiles, the row appears in the
// /search?category=templates feed and is buyable through the cart.
// ---------------------------------------------------------------------------
export const studioTemplates = pgTable(
  "studio_templates",
  {
    id:              uuid("id").primaryKey().defaultRandom(),
    creatorId:       uuid("creator_id")
                       .notNull()
                       .references(() => users.id, { onDelete: "cascade" }),
    /** Company-ownership: when set, royalties accrue to the company instead
     *  of the individual creator and the template appears as first-party on
     *  the marketplace (see HIRED_VIDEO_COMMUNITY first-party filter).
     *  creatorId stays as the user who hit publish for attribution.
     *  See migration 0058_studio_company_ownership.sql. */
    companyId:       uuid("company_id")
                       .references(() => companyProfiles.id, { onDelete: "cascade" }),
    /** Source studio project the template was forked from. Soft-link only —
     *  templates remain valid if the source project is later deleted. */
    sourceProjectId: uuid("source_project_id"),
    name:            varchar("name", { length: 200 }).notNull(),
    description:     text("description"),
    /** Optional preview thumbnail (frame from the source render or uploaded). */
    thumbnailUrl:    text("thumbnail_url"),
    /** Optional short preview clip (CDN url). */
    previewVideoUrl: text("preview_video_url"),
    /** Full VideoScript JSON minus user-specific fields (resumeText etc.). */
    videoScript:     jsonb("video_script").notNull(),
    /** Convenience metadata for catalog filters / cards — denormalised from
     *  videoScript so we can index without unpacking JSON on every query. */
    durationSec:     integer("duration_sec"),
    motion:          text("motion"),               // minimal | moderate | cinematic
    language:        text("language"),
    tags:            jsonb("tags").$type<string[]>().default([]).notNull(),
    /** Marketplace state. */
    visibility:      text("visibility").notNull().default("private"), // private | unlisted | public
    listingSlug:     text("listing_slug").unique(),
    /** Creator-set price. 0 = free (still requires a license claim). */
    priceCents:      integer("price_cents").notNull().default(0),
    currency:        text("currency").notNull().default("USD"),
    /** Snapshotted at first publish from PLATFORM_FEE_BPS_DEFAULT (or any
     *  per-creator override). 500 = 5% platform / 95% creator. Stored
     *  per-row so historical sales remain auditable when defaults change. */
    platformFeeBps:  integer("platform_fee_bps").notNull().default(500),
    /** Creator consent record — required on first publish, snapshotted here
     *  alongside the central legal_document_acceptances row. */
    consentAgreedAt: timestamp("consent_agreed_at", { withTimezone: true }),
    consentIp:       text("consent_ip"),
    consentUa:       text("consent_ua"),
    /** Marketplace stats. Updated by the catalog browse / purchase paths. */
    viewCount:       integer("view_count").notNull().default(0),
    purchaseCount:   integer("purchase_count").notNull().default(0),
    publishedAt:     timestamp("published_at", { withTimezone: true }),
    createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:       timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_studio_templates_creator").on(t.creatorId),
    index("idx_studio_templates_company").on(t.companyId),
    index("idx_studio_templates_visibility").on(t.visibility),
    index("idx_studio_templates_slug").on(t.listingSlug),
  ],
);

export type StudioTemplate = typeof studioTemplates.$inferSelect;
export type NewStudioTemplate = typeof studioTemplates.$inferInsert;

// ---------------------------------------------------------------------------
// Template Licenses — polymorphic ownership ledger.
//
// One row = "this user has the right to use this template." Covers all three
// template kinds the platform currently sells:
//   • 'resume' — descriptor-id resume templates from data/resume-templates
//   • 'job'    — descriptor-id job templates
//   • 'studio' — uuid studio_templates rows (new in this migration)
//
// Sources mirror the voice-clone licenses table:
//   • 'owner'    — the creator who published it (auto-granted on publish)
//   • 'free'     — buyer claimed a free public listing
//   • 'purchase' — buyer paid via cart; granted on payment-success webhook
//
// The pair (user_id, template_kind, template_id) is unique so duplicate
// fulfilment calls are idempotent.
// ---------------------------------------------------------------------------
export const templateLicenses = pgTable(
  "template_licenses",
  {
    id:               uuid("id").primaryKey().defaultRandom(),
    userId:           uuid("user_id")
                        .notNull()
                        .references(() => users.id, { onDelete: "cascade" }),
    templateKind:     text("template_kind").notNull(),  // 'resume' | 'job' | 'studio'
    /** Descriptor id (resume/job) or studio_templates.id (uuid as text). */
    templateId:       text("template_id").notNull(),
    source:           text("source").notNull(),         // 'owner' | 'free' | 'purchase'
    pricePaidCents:   integer("price_paid_cents").notNull().default(0),
    creatorCutCents:  integer("creator_cut_cents").notNull().default(0),
    platformCutCents: integer("platform_cut_cents").notNull().default(0),
    /** Stripe payment intent or Helcim transaction ref, when source=purchase. */
    paymentRef:       text("payment_ref"),
    grantedAt:        timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_template_licenses_user").on(t.userId),
    index("idx_template_licenses_template").on(t.templateKind, t.templateId),
    uniqueIndex("uq_template_licenses_grant").on(t.userId, t.templateKind, t.templateId),
  ],
);

export type TemplateLicense = typeof templateLicenses.$inferSelect;
export type NewTemplateLicense = typeof templateLicenses.$inferInsert;

export type TemplateKind = "resume" | "job" | "studio";
export const TEMPLATE_KINDS: TemplateKind[] = ["resume", "job", "studio"];
