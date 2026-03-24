/**
 * Studio Advertising Tables
 *
 * Supports the studio as an advertising/promotion tool for:
 *   - Companies (promotional videos, brand stories)
 *   - Recruiters (job ads, recruiter brand videos)
 *   - Job seekers (video resumes — existing use case)
 *
 * New tables:
 *   - studioBrandKits    — per-user brand colours/logo/font
 *   - videoAnalytics     — view + CTA click tracking per video
 *   - videoCampaigns     — group videos into ad campaigns with UTM tracking
 */

import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Brand kits — store a user's brand identity (logo, colours, font)
// ---------------------------------------------------------------------------
export const studioBrandKits = pgTable(
  "studio_brand_kits",
  {
    id:          uuid("id").primaryKey().defaultRandom(),
    userId:      text("user_id").notNull(),
    name:        text("name").notNull().default("My Brand"),
    logoUrl:     text("logo_url"),
    primaryColor:   text("primary_color").notNull().default("#2563eb"),
    secondaryColor: text("secondary_color").notNull().default("#0f172a"),
    accentColor:    text("accent_color").notNull().default("#14b8a6"),
    fontFamily:  text("font_family").notNull().default("Inter"),
    isDefault:   boolean("is_default").notNull().default(false),
    createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_studio_brand_kits_user").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Video analytics — lightweight view + CTA-click tracking
// ---------------------------------------------------------------------------
export const videoAnalytics = pgTable(
  "video_analytics",
  {
    id:        uuid("id").primaryKey().defaultRandom(),
    videoId:   text("video_id").notNull(),
    userId:    text("user_id"),           // null = anonymous viewer
    event:     text("event").notNull(),   // "view" | "cta_click" | "share"
    referrer:  text("referrer"),
    campaignId: text("campaign_id"),
    metadata:  jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_video_analytics_video").on(t.videoId),
    index("idx_video_analytics_event").on(t.event),
  ],
);

// ---------------------------------------------------------------------------
// Video campaigns — group videos for tracking a specific ad campaign
// ---------------------------------------------------------------------------
export const videoCampaigns = pgTable(
  "video_campaigns",
  {
    id:          uuid("id").primaryKey().defaultRandom(),
    userId:      text("user_id").notNull(),
    name:        text("name").notNull(),
    description: text("description"),
    utmSource:   text("utm_source"),
    utmMedium:   text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    status:      text("status").notNull().default("active"),   // active | paused | archived
    videoIds:    jsonb("video_ids").notNull().default("[]"),    // string[]
    stats:       jsonb("stats").notNull().default("{}"),        // cached rollup
    createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_video_campaigns_user").on(t.userId)],
);
