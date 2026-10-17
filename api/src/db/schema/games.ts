/**
 * Games schema — companion tables for `mediaKind: "game"` studio
 * projects. The game-kind project itself lives on `studio_projects`
 * (`gameState` JSONB column); this file holds the side-tables that
 * don't fit there:
 *
 *   - play invites (gap #1637, Phase 4) — tokenized share-links a
 *     project owner hands out so friends can join + play; stored in
 *     share_links (shareLinks.ts, kind game_play) since migration 0583.
 *   - `gameAgentConversations` (gap #1638, Phase 5) — persistent
 *     chat history for the AI game-builder agent, one row per
 *     (project, user) pair.
 *
 * `studio_projects.gameState` JSONB is still the SSoT for the game
 * world's *content* (entities, lighting, challenges). These tables
 * only carry metadata that is naturally relational (invite tokens,
 * per-user conversation threads).
 */

import { pgTable, uuid, integer, timestamp, jsonb, index, boolean } from "drizzle-orm/pg-core";
import { studioProjects } from "./resumes.js";
import { users } from "./users.js";

// Play invites (gap #1637, Phase 4) live in share_links (shareLinks.ts, kind
// game_play) since W3-A migration 0583.

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
