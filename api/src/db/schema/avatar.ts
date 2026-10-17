/**
 * Photoreal avatar render jobs (#1560). Moved from gapPass2.ts (2026-10-17).
 */
import { pgTable, uuid, text, varchar, integer, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";

// ---------------------------------------------------------------------------
// #1560 — photorealistic avatar render jobs
// ---------------------------------------------------------------------------
export const photorealAvatarRenders = pgTable(
  "photoreal_avatar_renders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** 'did' | 'heygen' | 'synthesia' | 'wav2lip_wasm' | … */
    provider: varchar("provider", { length: 32 }).notNull(),
    portraitMediaId: uuid("portrait_media_id"),
    voiceCloneId: uuid("voice_clone_id"),
    scriptText: text("script_text"),
    audioUrl: text("audio_url"),
    outputVideoUrl: text("output_video_url"),
    providerJobId: text("provider_job_id"),
    /** 'queued' | 'rendering' | 'completed' | 'failed'. */
    status: varchar("status", { length: 16 }).notNull().default("queued"),
    failureReason: text("failure_reason"),
    durationSeconds: integer("duration_seconds"),
    costCents: integer("cost_cents"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_photoreal_avatar_renders_owner").on(t.ownerUserId, t.status),
    check("photoreal_avatar_renders_status_check", sql`${t.status} IN ('queued', 'rendering', 'completed', 'failed')`),
  ],
);

export type PhotorealAvatarRender = typeof photorealAvatarRenders.$inferSelect;
export type NewPhotorealAvatarRender = typeof photorealAvatarRenders.$inferInsert;
