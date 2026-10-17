/**
 * Games schema — companion tables for `mediaKind: "game"` studio
 * projects. The game-kind project itself lives on `studio_projects`
 * (`gameState` JSONB column); this file holds the side-tables that
 * don't fit there:
 *
 *   - `gamePlayInvites` (gap #1637, Phase 4) — tokenized share-links
 *     a project owner can hand out so friends can join + play.
 *     Mirrors the [pipelineShareLinks](./recruiter.ts) pattern.
 *   - `gameAgentConversations` (gap #1638, Phase 5) — persistent
 *     chat history for the AI game-builder agent, one row per
 *     (project, user) pair.
 *
 * `studio_projects.gameState` JSONB is still the SSoT for the game
 * world's *content* (entities, lighting, challenges). These tables
 * only carry metadata that is naturally relational (invite tokens,
 * per-user conversation threads).
 */

import { pgTable, uuid, text, integer, timestamp, jsonb, index, boolean } from "drizzle-orm/pg-core";
import { studioProjects } from "./resumes.js";
import { users } from "./users.js";

// ─── Play invites (gap #1637, Phase 4) ─────────────────────────────────

export const gamePlayInvites = pgTable(
  "game_play_invites",
  {
    id:         uuid("id").primaryKey().defaultRandom(),
    projectId:  uuid("project_id").notNull().references(() => studioProjects.id, { onDelete: "cascade" }),
    createdBy:  uuid("created_by").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** URL-safe token (base64url, 24 bytes of entropy). Unique. */
    token:      text("token").notNull().unique(),
    /** Optional human label shown in the share-link dialog. */
    label:      text("label"),
    /** When non-null, joining requires the resolver to recognize this
     *  user id (account-bound link). Null = anyone with the token can
     *  join. */
    restrictToUserId: uuid("restrict_to_user_id").references(() => users.id, { onDelete: "set null" }),
    /** Max joins allowed (null = unlimited). The resolver bumps
     *  `joinedCount` and rejects once it reaches `maxUses`. */
    maxUses:    integer("max_uses"),
    joinedCount: integer("joined_count").notNull().default(0),
    /** Soft-revoke. Revoked links return 410 on resolve. */
    revokedAt:  timestamp("revoked_at", { withTimezone: true }),
    /** When set, the resolver rejects links past this timestamp. */
    expiresAt:  timestamp("expires_at", { withTimezone: true }),
    createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_game_play_invites_project").on(t.projectId),
    index("idx_game_play_invites_created_by").on(t.createdBy),
    index("idx_game_play_invites_restrict_to_user_id").on(t.restrictToUserId),
  ],
);

// ─── Agent conversations (gap #1638, Phase 5) ──────────────────────────

export const gameAgentConversations = pgTable(
  "game_agent_conversations",
  {
    id:         uuid("id").primaryKey().defaultRandom(),
    projectId:  uuid("project_id").notNull().references(() => studioProjects.id, { onDelete: "cascade" }),
    userId:     uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** JSONB array of `{role, content, toolCalls?}` records.
     *  Persisted so reopening the editor restores the chat thread.
     *  Capped at ~200 messages on insert; older messages are
     *  truncated by the route handler (the AI agent prompt also
     *  truncates downstream, so the cap is a storage hygiene
     *  measure, not a correctness one). */
    messages:   jsonb("messages").notNull().default([]),
    /** Total tokens billed across this thread — used by the
     *  [project_token_pricing](../../../../.claude/memory/project_token_pricing.md)
     *  caps. Bumped on every assistant turn. */
    tokensSpent: integer("tokens_spent").notNull().default(0),
    /** Whether the agent is currently running. The route flips this
     *  on tool-call streams so the editor can show a "agent is
     *  building…" status without re-pinging. */
    isRunning:   boolean("is_running").notNull().default(false),
    createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_game_agent_conversations_project").on(t.projectId),
    index("idx_game_agent_conversations_user").on(t.userId),
  ],
);
