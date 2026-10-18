/**
 * NLE (power-user video editor) Drizzle schema.
 *
 * The Timeline JSON itself lives on `studio_projects.state` (migration 0610) —
 * that schema (and the `kind` discriminator) is in resumes.ts because
 * studio_projects is defined there. This file owns the supporting tables
 * that don't belong on a project row, starting with `nle_media_sources`.
 *
 * See:
 *   - shared/timeline.ts            — Timeline JSON spec consumed by both editors
 *   - drizzle/0067_nle_timeline.sql — migration that creates these columns/tables
 *   - memory/project_nle_decision.md — the decision context (render path, milestones)
 */

import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  timestamp,
  index,
  uniqueIndex,
  primaryKey,
  check,
} from "drizzle-orm/pg-core";
// `sql` is the template-tag re-exported from drizzle-orm root, not from
// the pg-core subpath — pg-core only exports column builders / table
// helpers. Importing it from pg-core is what blocked the 2026-05-03
// production deploy.
import { sql } from "drizzle-orm";
import { users } from "./users.js";
import { companyProfiles } from "./companies.js";

/**
 * Deduplicated media uploads referenced by NLE timelines.
 *
 * One row per (workspace owner, content_hash) pair — re-uploading the
 * same clip across timelines reuses the row instead of writing new bytes.
 * The Timeline JSON holds only `sourceId`; the editor and render facade
 * resolve ids to URLs at the boundary.
 *
 * Ownership: companyId mirrors the studio_projects pattern. Reads filter
 * via buildOwnershipFilter(); writes go through assertCanWrite() in
 * services/studio/workspace.ts. Per project_studio_workspaces.md.
 */
export const nleMediaSources = pgTable(
  "nle_media_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").references(() => companyProfiles.id, {
      onDelete: "cascade",
    }),
    /** 'video' | 'audio' | 'image' — matches MediaKind in shared/timeline.ts. */
    kind: varchar("kind", { length: 16 }).notNull(),
    /** sha256 hex digest of the original bytes. Used for dedup + R2 key. */
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    /** R2 URL of the original upload. */
    url: text("url").notNull(),
    /**
     * R2 URL of the proxy (downsampled video) used by the editor for
     * fast scrubbing. Null until the proxy job completes. The render
     * facade always uses `url`, never the proxy.
     */
    proxyUrl: text("proxy_url"),
    /** Source duration in source-fps frames. Editor translates to timeline fps. */
    durationFrames: integer("duration_frames").notNull(),
    /** Native frame rate of the source. */
    fps: integer("fps").notNull(),
    /** Native dimensions. NULL for audio. */
    width: integer("width"),
    height: integer("height"),
    filename: text("filename").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    /**
     * Optional bin folder path the editor groups sources by. NULL = root.
     * Free-text rather than a separate folder table — see migration 0075.
     */
    binFolder: text("bin_folder"),
  },
  (table) => [
    index("idx_nle_media_sources_company").on(table.companyId),
    index("idx_nle_media_sources_bin_folder").on(table.userId, table.binFolder),
    // #1804 — LIKE 'prefix/%' on folder rename. Default-collation btree
    // cannot satisfy prefix LIKE; text_pattern_ops can. drizzle-kit push
    // does not compare opclass, so the SQL migration is the source of the
    // operator class; the name must still match or push drops it.
    index("idx_nle_media_sources_bin_folder_text_pattern").on(
      table.binFolder.op("text_pattern_ops"),
    ),
    // Dedup index: one row per (workspace, content_hash). Companies and
    // personal workspaces dedup independently. The COALESCE matches the
    // SQL migration so re-runs stay idempotent.
    uniqueIndex("idx_nle_media_sources_dedup").on(
      sql`COALESCE(${table.companyId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      table.userId,
      table.contentHash,
    ),
    check("nle_media_sources_kind_check", sql`${table.kind} IN ('video', 'audio', 'image')`),
  ],
);

export type NleMediaSource = typeof nleMediaSources.$inferSelect;
export type NewNleMediaSource = typeof nleMediaSources.$inferInsert;

/**
 * Free-text tags on NLE media sources. Powers the bin's facet filter —
 * see `BinPanel` on the frontend. Many-to-many; cascades on source
 * delete. Per migration 0075.
 */
export const nleMediaTags = pgTable(
  "nle_media_tags",
  {
    sourceId: uuid("source_id")
      .notNull()
      .references(() => nleMediaSources.id, { onDelete: "cascade" }),
    tag: varchar("tag", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sourceId, table.tag] }),
    index("idx_nle_media_tags_tag").on(table.tag),
  ],
);

export type NleMediaTag = typeof nleMediaTags.$inferSelect;
