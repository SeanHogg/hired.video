-- 0078 — Career 360 target + plan
--
-- Adds a single `career_target` JSONB column to `user_profiles` storing
-- the seeker's chosen career target plus the LLM-derived rubric, gap
-- analysis, and roadmap. One active target per user keeps the v1
-- surface focused — multi-target comparison is tracked as a separate
-- gap entry. Suggested targets (the picker carousel) are also cached
-- here to avoid re-prompting the LLM on every page load.
--
-- Shape (matches `shared/career360-types.ts`):
--   {
--     suggested?: TargetSuggestion[],   // last LLM batch, picker UI
--     suggestedAt?: string,             // ISO
--     selected?: {
--       id: string,
--       title: string,
--       seniority?: string,
--       description: string,
--       why: string,
--       timelineMonths: number,
--       chosenAt: string,
--       rubric: { ... },
--       gaps: Gap[],
--       roadmap: RoadmapStep[],
--       lastRefreshedAt: string,
--     }
--   }

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS career_target jsonb;
