-- Migration: 0021_tool_run_token_linkage
-- Close the loop between tool_runs and ai_usage_records so admin
-- analytics can attribute real token spend per tool run (and per user
-- per tool) instead of guessing from the free-form featureKey string.
--
-- Two columns, both nullable so existing data stays valid:
--   • tool_runs.tokens_used — accumulated tokens across every LLM call
--     the tool run made. Updated by tokenLedger.charge().
--   • ai_usage_records.tool_run_id — FK back to tool_runs for the charge
--     that was attributed to a tool run. Null for non-tool AI calls
--     (chat, autofill, dashboard insights, etc.).

ALTER TABLE "tool_runs"
  ADD COLUMN IF NOT EXISTS "tokens_used" integer DEFAULT 0;

ALTER TABLE "ai_usage_records"
  ADD COLUMN IF NOT EXISTS "tool_run_id" uuid
  REFERENCES "tool_runs"("id") ON DELETE SET NULL;

-- Lookups by tool_run_id power the per-run "what did this run cost"
-- drill-down on the admin tool-usage page.
CREATE INDEX IF NOT EXISTS "ai_usage_records_tool_run_id_idx"
  ON "ai_usage_records" ("tool_run_id");
