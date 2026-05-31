-- Migration 0190 — Cover images + lesson visual aids for the seeded
-- Learning Content Library (migration 0131).
--
-- Two gaps, one root cause: migration 0131 seeded five platform courses
-- with `cover_image_url = NULL` and every lesson as a wall of `text_md`
-- with zero visual aids. On the /tools Learning grid + the marketplace
-- the cards fell back to a bare GraduationCap icon, and the lessons read
-- as undifferentiated text.
--
-- The client-side cover generator (#1400, frontend/lib/courses/
-- cover-generator.ts) only fires when a creator clicks "Auto-generate",
-- which never happens for the system-owned seed library. So we mirror the
-- article cover backfill (migration 0122): point `cover_image_url` at a
-- stable, edge-cacheable worker endpoint that renders the SAME shared SVG
-- (@shared/course-cover via GET /api/og/courses) — no asset-upload round
-- trip needed.
--
-- For the lessons, we prepend a schematic concept diagram (served by
-- GET /api/og/lesson-diagram?d=<key>, bodies in @shared/course-diagrams)
-- as a standard markdown image so it renders through the existing
-- ReactMarkdown path in CourseLearner with no new renderer wiring.
--
-- Idempotent: cover backfill is guarded on `cover_image_url IS NULL`; the
-- lesson prepend is guarded on `body_md NOT LIKE '%lesson-diagram%'`.

-- ============================================================
-- 1. Course cover images (URL-encoded query strings)
-- ============================================================
UPDATE "courses" SET "cover_image_url" =
  '/api/og/courses?title=AI%20Fundamentals%20for%20Job%20Seekers&category=AI&difficulty=beginner'
WHERE "id" = (md5('seed-course:ai-fundamentals-job-seekers'))::uuid AND "cover_image_url" IS NULL;

UPDATE "courses" SET "cover_image_url" =
  '/api/og/courses?title=Retrieval-Augmented%20Generation%20%28RAG%29&category=AI&difficulty=intermediate'
WHERE "id" = (md5('seed-course:rag-essentials'))::uuid AND "cover_image_url" IS NULL;

UPDATE "courses" SET "cover_image_url" =
  '/api/og/courses?title=Prompt%20Engineering%20Essentials&category=AI&difficulty=beginner'
WHERE "id" = (md5('seed-course:prompt-engineering-essentials'))::uuid AND "cover_image_url" IS NULL;

UPDATE "courses" SET "cover_image_url" =
  '/api/og/courses?title=AI-Era%20Must-Have%20Skills&category=Career&difficulty=beginner'
WHERE "id" = (md5('seed-course:ai-era-must-have-skills'))::uuid AND "cover_image_url" IS NULL;

UPDATE "courses" SET "cover_image_url" =
  '/api/og/courses?title=Building%20with%20the%20Claude%20API&category=Engineering&difficulty=intermediate'
WHERE "id" = (md5('seed-course:building-with-the-claude-api'))::uuid AND "cover_image_url" IS NULL;

-- ============================================================
-- 2. Lesson visual aids — prepend a concept diagram to each body_md
--    `d` key mirrors the seed lesson slug so refs + registry can't drift.
-- ============================================================

-- AI Fundamentals
UPDATE "course_lessons" SET "body_md" =
  '![AI contains Machine Learning, which contains Deep Learning, which contains Large Language Models; Generative AI spans the inner layers.](/api/og/lesson-diagram?d=ai-fund-l1)' || E'\n\n' || "body_md"
WHERE "id" = (md5('seed-lesson:ai-fund:l1'))::uuid AND "body_md" NOT LIKE '%lesson-diagram%';

UPDATE "course_lessons" SET "body_md" =
  '![A stream of tokens flows into a fixed-size context window; tokens beyond the window are truncated and forgotten.](/api/og/lesson-diagram?d=ai-fund-l2)' || E'\n\n' || "body_md"
WHERE "id" = (md5('seed-lesson:ai-fund:l2'))::uuid AND "body_md" NOT LIKE '%lesson-diagram%';

UPDATE "course_lessons" SET "body_md" =
  '![A resume flows through ATS parsing, keyword matching, an AI summary and ranking layer, then to a human reviewer.](/api/og/lesson-diagram?d=ai-fund-l3)' || E'\n\n' || "body_md"
WHERE "id" = (md5('seed-lesson:ai-fund:l3'))::uuid AND "body_md" NOT LIKE '%lesson-diagram%';

UPDATE "course_lessons" SET "body_md" =
  '![Five pillars: judgment under ambiguity, building trust, taking responsibility, cross-domain synthesis, and knowing what to ask.](/api/og/lesson-diagram?d=ai-fund-l4)' || E'\n\n' || "body_md"
WHERE "id" = (md5('seed-lesson:ai-fund:l4'))::uuid AND "body_md" NOT LIKE '%lesson-diagram%';

-- RAG
UPDATE "course_lessons" SET "body_md" =
  '![Side-by-side: fine-tuning bakes the corpus into model weights, while RAG keeps the corpus in a database and fetches it at query time.](/api/og/lesson-diagram?d=rag-l1)' || E'\n\n' || "body_md"
WHERE "id" = (md5('seed-lesson:rag:l1'))::uuid AND "body_md" NOT LIKE '%lesson-diagram%';

UPDATE "course_lessons" SET "body_md" =
  '![A 2D vector space where semantically similar sentences cluster together and an unrelated sentence sits far away.](/api/og/lesson-diagram?d=rag-l2)' || E'\n\n' || "body_md"
WHERE "id" = (md5('seed-lesson:rag:l2'))::uuid AND "body_md" NOT LIKE '%lesson-diagram%';

UPDATE "course_lessons" SET "body_md" =
  '![Production RAG pipeline: query, vector search top-50, re-rank to top-5, LLM, grounded answer; plus the five failure modes.](/api/og/lesson-diagram?d=rag-l3)' || E'\n\n' || "body_md"
WHERE "id" = (md5('seed-lesson:rag:l3'))::uuid AND "body_md" NOT LIKE '%lesson-diagram%';

-- Prompt Engineering
UPDATE "course_lessons" SET "body_md" =
  '![Four dials labelled Role, Examples, Constraints, and Decomposition feeding into better model output.](/api/og/lesson-diagram?d=prompt-l1)' || E'\n\n' || "body_md"
WHERE "id" = (md5('seed-lesson:prompt:l1'))::uuid AND "body_md" NOT LIKE '%lesson-diagram%';

UPDATE "course_lessons" SET "body_md" =
  '![Three escalating techniques for structured output: ask for JSON, provider JSON mode, then a validate-and-repair loop.](/api/og/lesson-diagram?d=prompt-l2)' || E'\n\n' || "body_md"
WHERE "id" = (md5('seed-lesson:prompt:l2'))::uuid AND "body_md" NOT LIKE '%lesson-diagram%';

UPDATE "course_lessons" SET "body_md" =
  '![Chain-of-thought reasoning steps leading to a draft answer, then a self-critique loop that rewrites before returning.](/api/og/lesson-diagram?d=prompt-l3)' || E'\n\n' || "body_md"
WHERE "id" = (md5('seed-lesson:prompt:l3'))::uuid AND "body_md" NOT LIKE '%lesson-diagram%';

-- AI-Era Must-Have Skills
UPDATE "course_lessons" SET "body_md" =
  '![A trust gauge mapping tasks to low, medium, or high trust in AI output based on cost of error and verifiability.](/api/og/lesson-diagram?d=must-l1)' || E'\n\n' || "body_md"
WHERE "id" = (md5('seed-lesson:must:l1'))::uuid AND "body_md" NOT LIKE '%lesson-diagram%';

UPDATE "course_lessons" SET "body_md" =
  '![Upstream steps feed a task that AI compresses; downstream steps follow. Seeing the whole system is the leverage.](/api/og/lesson-diagram?d=must-l2)' || E'\n\n' || "body_md"
WHERE "id" = (md5('seed-lesson:must:l2'))::uuid AND "body_md" NOT LIKE '%lesson-diagram%';

UPDATE "course_lessons" SET "body_md" =
  '![A briefing template with five labelled fields: Role, Context, Input, Output, Constraints.](/api/og/lesson-diagram?d=must-l3)' || E'\n\n' || "body_md"
WHERE "id" = (md5('seed-lesson:must:l3'))::uuid AND "body_md" NOT LIKE '%lesson-diagram%';

-- Building with the Claude API
UPDATE "course_lessons" SET "body_md" =
  '![A minimal request flow: your code calls messages.create, the Claude API responds, you read response content; plus the Opus/Sonnet/Haiku picker.](/api/og/lesson-diagram?d=claude-l1)' || E'\n\n' || "body_md"
WHERE "id" = (md5('seed-lesson:claude:l1'))::uuid AND "body_md" NOT LIKE '%lesson-diagram%';

UPDATE "course_lessons" SET "body_md" =
  '![The tool-use agent loop: the model returns a tool_use block, you execute the function, return tool_result, and the model continues until it stops.](/api/og/lesson-diagram?d=claude-l2)' || E'\n\n' || "body_md"
WHERE "id" = (md5('seed-lesson:claude:l2'))::uuid AND "body_md" NOT LIKE '%lesson-diagram%';

UPDATE "course_lessons" SET "body_md" =
  '![Prompt caching: the first call pays a write premium, then reads within the 5-minute TTL cost about 10 percent; cache the system prompt, not the user message.](/api/og/lesson-diagram?d=claude-l3)' || E'\n\n' || "body_md"
WHERE "id" = (md5('seed-lesson:claude:l3'))::uuid AND "body_md" NOT LIKE '%lesson-diagram%';
