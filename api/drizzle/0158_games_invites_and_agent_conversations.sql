-- Migration 0158 — 3D-world game studio companion tables (gap #1637 Phase 4
-- + gap #1638 Phase 5). The game's content (entities, lighting, challenges)
-- continues to live on `studio_projects.gameState` JSONB; this migration
-- only adds the relational side-tables that don't fit inside that blob.
--
-- Idempotent — every CREATE statement uses IF NOT EXISTS so a re-run after
-- a partial-apply landing is safe (per project policy that the SQL runner
-- can re-fire from a partial state).

-- ─── game_play_invites (Phase 4 — friend-invite share-links) ─────────────
CREATE TABLE IF NOT EXISTS "game_play_invites" (
  "id"                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id"           uuid NOT NULL REFERENCES "studio_projects"("id") ON DELETE CASCADE,
  "created_by"           uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token"                text NOT NULL,
  "label"                text,
  "restrict_to_user_id"  uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "max_uses"             integer,
  "joined_count"         integer NOT NULL DEFAULT 0,
  "revoked_at"           timestamptz,
  "expires_at"           timestamptz,
  "created_at"           timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'game_play_invites_token_key'
  ) THEN
    ALTER TABLE "game_play_invites"
      ADD CONSTRAINT "game_play_invites_token_key" UNIQUE ("token");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_game_play_invites_project"
  ON "game_play_invites" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_game_play_invites_created_by"
  ON "game_play_invites" ("created_by");

-- ─── game_agent_conversations (Phase 5 — AI game-builder chat history) ───
CREATE TABLE IF NOT EXISTS "game_agent_conversations" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id"    uuid NOT NULL REFERENCES "studio_projects"("id") ON DELETE CASCADE,
  "user_id"       uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "messages"      jsonb NOT NULL DEFAULT '[]'::jsonb,
  "tokens_spent"  integer NOT NULL DEFAULT 0,
  "is_running"    boolean NOT NULL DEFAULT false,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_game_agent_conversations_project"
  ON "game_agent_conversations" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_game_agent_conversations_user"
  ON "game_agent_conversations" ("user_id");
