/**
 * uploaded_assets — one row per R2 object a user uploads or the platform
 * generates for them (migration 0512, gaps #733 / #950).
 *
 * Written by `putObject` (services/storage/object-store.ts), the ONE R2
 * write path, so every upload is recorded without per-route code. Powers the
 * cursor-paginated media library (`GET /api/upload/images`) and gives
 * cleanup a table to walk instead of listing R2 prefixes.
 *
 * `kind` values: shared/uploaded-assets.ts (CHECK constraint in 0512).
 * `r2_key` is unique: a re-put of the same key (an overwrite) updates the row.
 */
import { pgTable, uuid, varchar, text, integer, bigint, timestamp, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";
import { studioProjects } from "./resumes.js";

export const uploadedAssets = pgTable(
  "uploaded_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    r2Key: text("r2_key").notNull(),
    kind: varchar("kind", { length: 16 }).notNull(),
    contentType: varchar("content_type", { length: 127 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    width: integer("width"),
    height: integer("height"),
    sourceProjectId: uuid("source_project_id").references(() => studioProjects.id, { onDelete: "set null" }),
    // Millisecond precision so the keyset cursor (a JS Date) matches exactly.
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_uploaded_assets_r2_key").on(t.r2Key),
    index("idx_uploaded_assets_user_kind_created").on(
      t.userId,
      t.kind,
      t.createdAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    check(
      "uploaded_assets_kind_check",
      sql`${t.kind} IN ('image', 'ai_image', 'avatar', 'video', 'recording', 'audio', 'voice', 'file', 'scorm')`,
    ),
    check("uploaded_assets_size_check", sql`${t.sizeBytes} >= 0`),
    index("idx_uploaded_assets_source_project_id").on(t.sourceProjectId),
  ],
);

export type UploadedAssetRow = typeof uploadedAssets.$inferSelect;
export type NewUploadedAssetRow = typeof uploadedAssets.$inferInsert;
