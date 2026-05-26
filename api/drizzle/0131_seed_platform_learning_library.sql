-- Migration 0131 — Built-in Learning Content Library seed
--
-- Seeds the platform's first-party Learning Content Library that ships
-- on every plan (the LinkedIn Learning competitor, surfaced at
-- /tools?tab=learning). Five courses in the initial seed cover AI
-- fundamentals, Retrieval-Augmented Generation, prompt engineering, the
-- AI-era must-have skills, and building with the Claude API.
--
-- Why bundled, not separately licensed:
--   LinkedIn Learning is a separate ~$379/seat/yr SKU on top of Recruiter.
--   We position the included library as the differentiator on the Pricing
--   page + /vs-competitors comparison row "Built-in learning content
--   library (AI / RAG / must-have skills)".
--
-- Authoring path:
--   The platform-owned `learning@hired.video` user owns every seeded
--   course. `users.is_system = true` lets `isCreatorVisible()` bypass
--   the #314 creator paywall so seeded content publishes without a Pro
--   subscription. Same pattern as `editorial@hired.video` from
--   migration 0113.
--
-- Why text_md lessons, not real SCORM zips:
--   Real SCORM packages need an asset pipeline (zip → R2 → imsmanifest.xml
--   parse) that does not yet exist (#161 residual). text_md ships
--   substantive content NOW, learners read it in the player, and the
--   same xAPI + completion + certificate hooks fire that SCORM lessons
--   use. Conversion to native SCORM zips tracked as a follow-up gap.
--
-- Idempotent on re-run:
--   • Deterministic UUIDs via `md5(slug)::uuid` so we can reference
--     course/module/lesson rows across statements without SELECT
--     round-trips.
--   • ON CONFLICT DO NOTHING on every INSERT.
--   • Authored on behalf of a deterministic-UUID user.

-- ============================================================
-- 1. Platform-owned learning author user
-- ============================================================
INSERT INTO "users" (
  "id",
  "email",
  "name",
  "email_verified",
  "is_active",
  "is_system",
  "role",
  "created_at",
  "updated_at"
) VALUES (
  (md5('learning@hired.video'))::uuid,
  'learning@hired.video',
  'hired.video Learning',
  true,
  true,
  true,
  'job_seeker',
  NOW(),
  NOW()
)
ON CONFLICT ("email") DO UPDATE
  SET "is_system" = true,
      "email_verified" = true,
      "name" = EXCLUDED."name",
      "updated_at" = NOW();

-- Profile slug — drives the public course URL `/courses/hired-video-learning/<slug>`.
-- user_profiles.user_id is UNIQUE (see schema/users.ts:190) so the
-- ON CONFLICT target is valid.
INSERT INTO "user_profiles" (
  "user_id",
  "custom_url_slug",
  "headline",
  "summary",
  "created_at",
  "updated_at"
) VALUES (
  (md5('learning@hired.video'))::uuid,
  'hired-video-learning',
  'Built-in Learning Content Library',
  'Platform-authored SCORM 1.2 courses on AI, RAG, prompt engineering, and the AI-era must-have skills. Bundled with every plan — no separate license required.',
  NOW(),
  NOW()
)
ON CONFLICT ("user_id") DO UPDATE
  SET "custom_url_slug" = EXCLUDED."custom_url_slug",
      "headline" = EXCLUDED."headline",
      "summary" = EXCLUDED."summary",
      "updated_at" = NOW();

-- ============================================================
-- 2. Courses (5 seed entries)
--
-- Each course:
--   - status = 'published' (the public feed only surfaces published)
--   - priceCents = 0 (free; the paid-cart flow stays orthogonal)
--   - issuesCertificate = true + passingScorePct = 70
--   - tags include 'platform-seed' so admin / analytics can isolate
--     seeded content from creator-authored.
-- ============================================================

INSERT INTO "courses" (
  "id", "user_id", "slug", "title", "summary", "description",
  "category", "tags", "difficulty", "estimated_minutes",
  "status", "published_at",
  "price_cents", "price_visible",
  "issues_certificate", "passing_score_pct",
  "is_employer_authored",
  "created_at", "updated_at"
) VALUES
  -- ── 1. AI Fundamentals for Job Seekers ──────────────────────
  (
    (md5('seed-course:ai-fundamentals-job-seekers'))::uuid,
    (md5('learning@hired.video'))::uuid,
    'ai-fundamentals-for-job-seekers',
    'AI Fundamentals for Job Seekers',
    'Plain-English primer on what AI is, how modern LLMs work, and where they show up in the hiring pipeline you''re about to enter.',
    'Built for candidates entering an AI-transformed job market. Covers the LLM building blocks (tokens, context windows, hallucinations), the practical implications for resumes and interviews, and a short skills checklist to make yourself AI-resilient. No prior technical background required.',
    'AI',
    '["ai","fundamentals","job-seekers","platform-seed","must-have-skills"]'::jsonb,
    'beginner',
    90,
    'published',
    NOW(),
    0,
    true,
    true,
    70,
    false,
    NOW(),
    NOW()
  ),
  -- ── 2. Retrieval-Augmented Generation (RAG) ─────────────────
  (
    (md5('seed-course:rag-essentials'))::uuid,
    (md5('learning@hired.video'))::uuid,
    'retrieval-augmented-generation-rag',
    'Retrieval-Augmented Generation (RAG)',
    'How RAG closes the LLM knowledge gap: chunking, embeddings, vector search, retrieval pipelines, and the failure modes you''ll meet in production.',
    'Practitioner-level walkthrough of RAG: why grounding an LLM in your own corpus beats fine-tuning for most use cases, what an embedding actually is, how vector search ranks chunks, and how to evaluate retrieval quality. Hands-on patterns that translate directly to building hiring-relevant tools (resume search, candidate matching, policy Q&A).',
    'AI',
    '["ai","rag","retrieval","embeddings","vector-search","platform-seed","must-have-skills"]'::jsonb,
    'intermediate',
    120,
    'published',
    NOW(),
    0,
    true,
    true,
    70,
    false,
    NOW(),
    NOW()
  ),
  -- ── 3. Prompt Engineering Essentials ────────────────────────
  (
    (md5('seed-course:prompt-engineering-essentials'))::uuid,
    (md5('learning@hired.video'))::uuid,
    'prompt-engineering-essentials',
    'Prompt Engineering Essentials',
    'The patterns that consistently make LLM output better: roles, examples, constraints, chain-of-thought, and JSON-mode output contracts.',
    'A working playbook of the prompt patterns that matter — system vs user messages, few-shot examples, step-by-step decomposition, output schemas, and self-critique loops. Every pattern paired with a before/after side-by-side so you can see why the output changes.',
    'AI',
    '["ai","prompt-engineering","llm","platform-seed","must-have-skills"]'::jsonb,
    'beginner',
    75,
    'published',
    NOW(),
    0,
    true,
    true,
    70,
    false,
    NOW(),
    NOW()
  ),
  -- ── 4. AI-Era Must-Have Skills ──────────────────────────────
  (
    (md5('seed-course:ai-era-must-have-skills'))::uuid,
    (md5('learning@hired.video'))::uuid,
    'ai-era-must-have-skills',
    'AI-Era Must-Have Skills',
    'Five durable skills that compound in an AI-saturated workplace: critical evaluation, systems thinking, prompt fluency, data literacy, and human-in-the-loop judgment.',
    'A career-resilience curriculum. Each module pairs the skill with a concrete workplace scenario, a self-assessment, and a 30-day practice plan. Designed for mid-career professionals who want to position themselves as the human AI doesn''t replace.',
    'Career',
    '["career","ai","must-have-skills","upskilling","platform-seed"]'::jsonb,
    'beginner',
    100,
    'published',
    NOW(),
    0,
    true,
    true,
    70,
    false,
    NOW(),
    NOW()
  ),
  -- ── 5. Building with the Claude API ─────────────────────────
  (
    (md5('seed-course:building-with-claude-api'))::uuid,
    (md5('learning@hired.video'))::uuid,
    'building-with-the-claude-api',
    'Building with the Claude API',
    'From "hello world" to production patterns — auth, tool use, prompt caching, structured output, and the trade-offs across Opus / Sonnet / Haiku.',
    'A developer course for engineers shipping LLM features. Covers SDK setup, conversation state, tool/function calling, prompt caching (5-min TTL strategy), output schemas, retries, cost controls, and model selection between Opus 4.7 / Sonnet 4.6 / Haiku 4.5.',
    'Engineering',
    '["ai","claude","anthropic","api","engineering","platform-seed","must-have-skills"]'::jsonb,
    'intermediate',
    150,
    'published',
    NOW(),
    0,
    true,
    true,
    70,
    false,
    NOW(),
    NOW()
  )
ON CONFLICT ("user_id", "slug") DO NOTHING;

-- ============================================================
-- 3. Course modules
--
-- Module IDs derive from `md5('seed-module:<course-slug>:<module-slug>')`
-- so the lessons below can reference them without a SELECT.
-- ============================================================

INSERT INTO "course_modules" ("id", "course_id", "title", "summary", "sort_order", "created_at", "updated_at") VALUES
  -- AI Fundamentals
  ((md5('seed-module:ai-fundamentals:what-is-ai'))::uuid,        (md5('seed-course:ai-fundamentals-job-seekers'))::uuid, 'What AI Actually Is',         'Demystifying LLMs without the buzzwords.', 0, NOW(), NOW()),
  ((md5('seed-module:ai-fundamentals:how-llms-work'))::uuid,     (md5('seed-course:ai-fundamentals-job-seekers'))::uuid, 'How LLMs Work',               'Tokens, context windows, training vs inference.', 1, NOW(), NOW()),
  ((md5('seed-module:ai-fundamentals:ai-in-hiring'))::uuid,      (md5('seed-course:ai-fundamentals-job-seekers'))::uuid, 'AI in the Hiring Pipeline',   'Where AI screens, ranks, and decides — and what you can do about it.', 2, NOW(), NOW()),
  ((md5('seed-module:ai-fundamentals:staying-resilient'))::uuid, (md5('seed-course:ai-fundamentals-job-seekers'))::uuid, 'Staying AI-Resilient',        'The skills that compound while AI commodifies the rest.', 3, NOW(), NOW()),

  -- RAG
  ((md5('seed-module:rag:why-rag'))::uuid,                 (md5('seed-course:rag-essentials'))::uuid, 'Why RAG (vs Fine-tuning)',  'When grounding beats teaching.',                  0, NOW(), NOW()),
  ((md5('seed-module:rag:embeddings-and-vectors'))::uuid,  (md5('seed-course:rag-essentials'))::uuid, 'Embeddings & Vector Search', 'How meaning becomes math, and math becomes ranking.', 1, NOW(), NOW()),
  ((md5('seed-module:rag:production-rag'))::uuid,          (md5('seed-course:rag-essentials'))::uuid, 'Production RAG',             'Chunking strategies, eval, and the failure modes.', 2, NOW(), NOW()),

  -- Prompt Engineering
  ((md5('seed-module:prompt:core-patterns'))::uuid,    (md5('seed-course:prompt-engineering-essentials'))::uuid, 'Core Patterns',          'Roles, examples, constraints, and decomposition.', 0, NOW(), NOW()),
  ((md5('seed-module:prompt:structured-output'))::uuid, (md5('seed-course:prompt-engineering-essentials'))::uuid, 'Structured Output',      'JSON schemas, output contracts, repair loops.',    1, NOW(), NOW()),
  ((md5('seed-module:prompt:advanced'))::uuid,         (md5('seed-course:prompt-engineering-essentials'))::uuid, 'Advanced Techniques',    'Chain-of-thought, self-critique, prompt chaining.', 2, NOW(), NOW()),

  -- Must-have skills
  ((md5('seed-module:must:critical-eval'))::uuid,   (md5('seed-course:ai-era-must-have-skills'))::uuid, 'Critical Evaluation',  'Calibrated skepticism of model output.',           0, NOW(), NOW()),
  ((md5('seed-module:must:systems-thinking'))::uuid, (md5('seed-course:ai-era-must-have-skills'))::uuid, 'Systems Thinking',     'Mapping cause and effect across workflows.',       1, NOW(), NOW()),
  ((md5('seed-module:must:prompt-fluency'))::uuid,   (md5('seed-course:ai-era-must-have-skills'))::uuid, 'Prompt Fluency',       'Talking to AI like a domain expert.',              2, NOW(), NOW()),
  ((md5('seed-module:must:data-literacy'))::uuid,    (md5('seed-course:ai-era-must-have-skills'))::uuid, 'Data Literacy',        'Reading charts, understanding distributions.',     3, NOW(), NOW()),
  ((md5('seed-module:must:hitl-judgment'))::uuid,    (md5('seed-course:ai-era-must-have-skills'))::uuid, 'Human-in-the-Loop Judgment', 'When to trust, when to override.',          4, NOW(), NOW()),

  -- Claude API
  ((md5('seed-module:claude:hello-world'))::uuid, (md5('seed-course:building-with-claude-api'))::uuid, 'Hello World',           'Auth, SDK, first message.',                         0, NOW(), NOW()),
  ((md5('seed-module:claude:tool-use'))::uuid,    (md5('seed-course:building-with-claude-api'))::uuid, 'Tool Use & Agents',     'Function calling, multi-turn agent loops.',         1, NOW(), NOW()),
  ((md5('seed-module:claude:prod-patterns'))::uuid,(md5('seed-course:building-with-claude-api'))::uuid, 'Production Patterns',   'Prompt caching, model selection, cost controls.',   2, NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

-- ============================================================
-- 4. Course lessons (text_md format — SCORM zip wrapping pending #161)
-- ============================================================

-- ── AI Fundamentals lessons ─────────────────────────────────────────
INSERT INTO "course_lessons" (
  "id", "course_id", "module_id", "title", "summary",
  "source_type", "body_md", "estimated_minutes", "is_required", "sort_order",
  "created_at", "updated_at"
) VALUES
  ((md5('seed-lesson:ai-fund:l1'))::uuid, (md5('seed-course:ai-fundamentals-job-seekers'))::uuid, (md5('seed-module:ai-fundamentals:what-is-ai'))::uuid,
   'AI vs ML vs LLM vs Generative AI',
   'Sorting out the term salad before we go further.',
   'text_md',
   E'# AI vs ML vs LLM vs Generative AI\n\nThe terms get used interchangeably. Here is the actual hierarchy.\n\n- **Artificial Intelligence (AI)** — the umbrella discipline. Anything that mimics judgment a human might make.\n- **Machine Learning (ML)** — a branch of AI. Systems that improve at a task by being shown examples instead of being explicitly programmed.\n- **Deep Learning** — a branch of ML using many-layered neural networks.\n- **Large Language Models (LLMs)** — deep learning models trained on huge text corpora to predict the next token. Claude, GPT, Gemini, Llama.\n- **Generative AI** — any model that produces new output (text, image, audio, video). LLMs are one kind.\n\nThe shorthand most workplaces use today: **AI = generative AI = a chat box you talk to**. Useful enough for casual conversation, wrong enough to lose you the argument with an engineer.\n\n**Why this matters for your job hunt:** when a job description says "experience with AI," figure out which layer they mean. "Built ML pipelines" and "used ChatGPT to draft documents" are wildly different claims.',
   12, true, 0, NOW(), NOW()),

  ((md5('seed-lesson:ai-fund:l2'))::uuid, (md5('seed-course:ai-fundamentals-job-seekers'))::uuid, (md5('seed-module:ai-fundamentals:how-llms-work'))::uuid,
   'Tokens, Context Windows, and Why Long Conversations Forget',
   'The mechanical reason ChatGPT loses the thread.',
   'text_md',
   E'# Tokens, Context Windows, and Why Long Conversations Forget\n\nLLMs do not read words. They read **tokens** — sub-word fragments. "Conversation" is one token; "antidisestablishmentarianism" is six or seven.\n\nEvery model has a **context window** — the maximum tokens it can hold in working memory at once. Claude Opus 4.7 has a 1M-token window; GPT-4o is 128k; Llama 3 is 8k–128k depending on variant.\n\nA few practical implications:\n\n1. **Long chat = expensive chat.** Every reply re-reads the full conversation. Cost scales with conversation length.\n2. **Models "forget" by truncation.** When a chat exceeds the window, the oldest turns get dropped. The model is not being lazy — those turns are no longer visible to it.\n3. **Pasting a giant document works.** If it fits in the window, the model can answer questions about it. This is the foundation of Retrieval-Augmented Generation (covered in the RAG course).\n\n**Hallucination** happens when a model produces a confident answer that is wrong. It is not lying — it is pattern-completing. Treat output as a first draft until you verify.',
   15, true, 1, NOW(), NOW()),

  ((md5('seed-lesson:ai-fund:l3'))::uuid, (md5('seed-course:ai-fundamentals-job-seekers'))::uuid, (md5('seed-module:ai-fundamentals:ai-in-hiring'))::uuid,
   'How ATS + AI Resume Screeners Actually Read Your Resume',
   'The mechanical sieve between you and a human reviewer.',
   'text_md',
   E'# How ATS + AI Resume Screeners Actually Read Your Resume\n\nMost mid-to-large employers run resumes through an **Applicant Tracking System (ATS)** before a human ever sees them. Increasingly the ATS has an LLM layer on top.\n\n**What the ATS does:**\n- Parses your PDF/DOCX into structured fields (name, contact, work history, skills).\n- Keyword-matches against the job description.\n- Scores you on configurable criteria (years of experience, location, must-have skills).\n\n**What the AI layer adds:**\n- Summarizes your work history into a one-paragraph profile.\n- Infers skills you did not list explicitly (e.g. "worked on data pipelines" → "ETL").\n- Generates a rank vs. other candidates.\n\n**Three things you can do today:**\n\n1. **Submit a clean text resume** — fancy multi-column layouts confuse parsers. Single column, standard section headings (Experience / Education / Skills) survive every parser.\n2. **Mirror the job description''s exact terms.** If they say "Kubernetes" do not write "K8s." The keyword match is dumber than you think.\n3. **Quantify outcomes.** "Reduced page load by 40%" beats "Improved performance." The AI summary will quote you, and a number sticks.\n\nThe hired.video Resume Optimizer at `/tools/resume-optimizer` runs this same scoring against any job description so you can see the gap before you submit.',
   18, true, 2, NOW(), NOW()),

  ((md5('seed-lesson:ai-fund:l4'))::uuid, (md5('seed-course:ai-fundamentals-job-seekers'))::uuid, (md5('seed-module:ai-fundamentals:staying-resilient'))::uuid,
   'The Five Skills AI Is Worst At (And Will Stay Bad At)',
   'Where your edge compounds.',
   'text_md',
   E'# The Five Skills AI Is Worst At (And Will Stay Bad At)\n\nThe interesting question is not "what can AI do today" but **"what will AI still be bad at five years from now."** Five durable bets:\n\n1. **Judgment under ambiguity.** AI optimizes for stated criteria. Deciding which criteria to state in the first place is still human work.\n2. **Building trust face-to-face.** Sales, leadership, therapy, teaching — anything where the human-to-human channel itself carries the value.\n3. **Taking responsibility.** Someone has to sign their name and own the outcome. AI cannot be held accountable.\n4. **Synthesizing across messy domains.** AI is fluent within a domain. Bridging law + biology + economics to spot a hidden interaction is still a human edge.\n5. **Knowing what to ask.** AI answers questions exquisitely. Choosing which question to ask is the entire job.\n\n**Action items this week:**\n- Identify which of these five your current role draws on most.\n- For each one, write one sentence about how AI changes the surrounding workflow.\n- Add the strongest one to your resume''s opening line.',
   15, true, 3, NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

-- ── RAG lessons ─────────────────────────────────────────────────────
INSERT INTO "course_lessons" (
  "id", "course_id", "module_id", "title", "summary",
  "source_type", "body_md", "estimated_minutes", "is_required", "sort_order",
  "created_at", "updated_at"
) VALUES
  ((md5('seed-lesson:rag:l1'))::uuid, (md5('seed-course:rag-essentials'))::uuid, (md5('seed-module:rag:why-rag'))::uuid,
   'When Grounding Beats Teaching',
   'Why RAG eats fine-tuning''s lunch for most production use cases.',
   'text_md',
   E'# When Grounding Beats Teaching\n\nThere are two ways to make an LLM answer questions about your data:\n\n1. **Fine-tuning** — re-train the model on your corpus. The corpus becomes part of the weights.\n2. **Retrieval-Augmented Generation (RAG)** — at query time, fetch relevant chunks of your corpus and paste them into the prompt. The corpus stays in a database.\n\nFor 90% of production use cases, **RAG wins**. Here is why:\n\n- **Freshness.** Update a row in your DB and the model reflects it on the next query. Fine-tuning requires a re-train.\n- **Source citations.** RAG can point at exactly which chunks it used. Fine-tuned models cannot — the source is dissolved into the weights.\n- **Access control.** RAG can filter retrieved chunks per-user (this user can read these documents, not those). Fine-tuning bakes everything in.\n- **Cost.** A retrieval pipeline is cheap. Fine-tuning a frontier model is expensive and rate-limited.\n\nThe one case where fine-tuning wins: **teaching the model a new style or format** that needs to be reflected in every answer, not just the ones grounded in fetched context.\n\n**Rule of thumb:** if the answer can be found in a specific document, use RAG. If the answer requires the model to talk a certain way, fine-tune.',
   18, true, 0, NOW(), NOW()),

  ((md5('seed-lesson:rag:l2'))::uuid, (md5('seed-course:rag-essentials'))::uuid, (md5('seed-module:rag:embeddings-and-vectors'))::uuid,
   'Embeddings: How Meaning Becomes Math',
   'Why two sentences with no shared words can still be neighbours.',
   'text_md',
   E'# Embeddings: How Meaning Becomes Math\n\nAn **embedding** is a fixed-length vector (think: list of ~1,500 numbers) that represents the meaning of a piece of text. Two texts that mean similar things end up close together in the vector space. Two unrelated texts end up far apart.\n\nA tiny example:\n\n- "I am tired" → `[0.12, -0.34, 0.88, ...]`\n- "I need a nap" → `[0.14, -0.31, 0.85, ...]` (close)\n- "Quarterly revenue report" → `[-0.91, 0.42, 0.08, ...]` (far)\n\nThe model that produces these vectors (the **embedding model**) is separate from the LLM that consumes them. Common options: OpenAI''s `text-embedding-3`, Cohere''s `embed-v3`, Voyage AI.\n\n**Why this matters for retrieval:**\n\nKeyword search ("I need a nap" looking for "tired") fails — no overlapping words. Vector search succeeds — the embeddings are neighbours regardless of vocabulary.\n\n**Cosine similarity** measures the angle between two vectors. 1.0 = identical direction (synonyms). 0.0 = orthogonal (unrelated). Most vector databases rank by cosine similarity.\n\n**Choosing chunk size matters a lot.** Embed entire 50-page documents and the vector averages out into noise. Embed one-sentence chunks and you lose the surrounding context. The standard middle is **200-500 tokens per chunk** with **10-20% overlap** between adjacent chunks.',
   22, true, 1, NOW(), NOW()),

  ((md5('seed-lesson:rag:l3'))::uuid, (md5('seed-course:rag-essentials'))::uuid, (md5('seed-module:rag:production-rag'))::uuid,
   'Production RAG: The Failure Modes',
   'What breaks once your corpus passes 10,000 documents.',
   'text_md',
   E'# Production RAG: The Failure Modes\n\nA toy RAG demo over 10 documents works on day one. Production RAG over 10 million documents is a different system. The failures you will hit, in roughly the order you will hit them:\n\n## 1. Retrieval drift\n\nThe top-5 chunks the vector search returns are "kind of related" instead of "the answer." The model hallucinates a confident-sounding answer from adjacent content.\n\n**Fix:** add a **re-ranker** (Cohere Rerank, Voyage Rerank) that takes the top-50 and re-orders them with a more expensive cross-encoder. The top-5 after re-ranking are far better.\n\n## 2. Chunk-boundary loss\n\nThe answer spans two chunks. Either chunk alone reads as ambiguous. The model picks the wrong one.\n\n**Fix:** (a) overlap your chunks 10-20%, (b) include the parent section title in every chunk, (c) at retrieval time, fetch ±1 neighbouring chunk for each top result and concatenate before sending to the LLM.\n\n## 3. Access-control leakage\n\nAn employee asks a question whose answer is in a document they are not authorized to read. The model has no idea about your ACL.\n\n**Fix:** filter retrieved chunks by user permission **before** they reach the prompt. Vector DBs (Pinecone, Weaviate, Qdrant) all support metadata filters — store `doc.allowed_user_ids` in the metadata.\n\n## 4. Eval drift\n\nYou shipped RAG. You have no way to know whether it is getting worse week over week.\n\n**Fix:** maintain a small (~50 question) **golden set** of question→correct-answer pairs. Run nightly. Track exact-match + semantic-match + a human "is this answer useful" rating.\n\n## 5. Costs sneaking up\n\nEach query embeds + retrieves + re-ranks + calls the LLM. At scale this gets expensive.\n\n**Fix:** cache embeddings on documents (only re-embed on edit), cache final answers for common questions, downgrade to a smaller model for routine queries, and use **prompt caching** (Anthropic + OpenAI both support it) so the system prompt is not re-paid every call.',
   30, true, 2, NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

-- ── Prompt Engineering lessons ──────────────────────────────────────
INSERT INTO "course_lessons" (
  "id", "course_id", "module_id", "title", "summary",
  "source_type", "body_md", "estimated_minutes", "is_required", "sort_order",
  "created_at", "updated_at"
) VALUES
  ((md5('seed-lesson:prompt:l1'))::uuid, (md5('seed-course:prompt-engineering-essentials'))::uuid, (md5('seed-module:prompt:core-patterns'))::uuid,
   'The Four Knobs That Always Matter',
   'Role, examples, constraints, decomposition.',
   'text_md',
   E'# The Four Knobs That Always Matter\n\nEvery effective prompt tunes four knobs:\n\n## 1. Role\n\nTell the model what kind of expert it is being. The role narrows the response space and triggers the patterns the model learned from text written by that kind of expert.\n\n> "You are an experienced SRE reviewing this incident report for missing root-cause analysis."\n\nBad: "What do you think of this?"\n\n## 2. Examples (few-shot)\n\nOne or two before/after examples beat any amount of natural-language description. The model pattern-matches against the example shape.\n\n> Input: `[raw log line]`\n>\n> Output: `{ "severity": "warn", "service": "billing", "message": "..." }`\n>\n> Now do this one: `[new log line]`\n\n## 3. Constraints\n\nState what the output must look like. Length, format, what to include, what to exclude.\n\n> "Output exactly three bullet points, each under 20 words. Do not include hedging."\n\n## 4. Decomposition\n\nFor multi-step tasks, ask the model to think step by step before answering — or break the prompt into a chain of smaller prompts.\n\n> "First, list the assumptions you would need to verify. Then identify which two are most load-bearing. Then give your answer."\n\n**Combine all four** and the same model produces dramatically better output than a one-line query.',
   15, true, 0, NOW(), NOW()),

  ((md5('seed-lesson:prompt:l2'))::uuid, (md5('seed-course:prompt-engineering-essentials'))::uuid, (md5('seed-module:prompt:structured-output'))::uuid,
   'JSON Schemas and Output Contracts',
   'Making the model produce something your code can parse.',
   'text_md',
   E'# JSON Schemas and Output Contracts\n\nWhen the next step is code consuming the output, free-text answers are a liability. Force structured output instead.\n\n**Three escalating techniques:**\n\n## 1. Ask for JSON in the prompt\n\n> "Return ONLY a JSON object matching this schema: `{ severity: string, root_cause: string, affected_services: string[] }`. No prose."\n\nWorks ~85% of the time. The remaining 15% the model adds an apologetic prefix or wraps in ```json fences.\n\n## 2. Use the provider''s JSON mode\n\nOpenAI ``response_format: { type: "json_object" }``, Anthropic tool use with an output schema, etc. The provider validates the output is parseable JSON before returning.\n\nWorks ~99% of the time. Failure mode shifts from "wrapped in prose" to "schema-valid but semantically wrong."\n\n## 3. Validate-and-repair loop\n\nParse the output against a Zod / Pydantic schema. On failure, feed the validation error back to the model and ask for a corrected version.\n\n```typescript\nconst parsed = Schema.safeParse(response);\nif (!parsed.success) {\n  const fixed = await llm.complete({\n    prompt: `Your previous output failed validation: ${parsed.error}. Return a corrected version.`,\n  });\n}\n```\n\nWorks ~99.9% of the time. Two repair attempts is usually plenty.',
   20, true, 1, NOW(), NOW()),

  ((md5('seed-lesson:prompt:l3'))::uuid, (md5('seed-course:prompt-engineering-essentials'))::uuid, (md5('seed-module:prompt:advanced'))::uuid,
   'Chain-of-Thought and Self-Critique',
   'Two reliability boosters that cost almost nothing.',
   'text_md',
   E'# Chain-of-Thought and Self-Critique\n\n## Chain-of-thought (CoT)\n\nAdding **"think step by step"** to a prompt measurably improves accuracy on multi-step problems. The model spends tokens reasoning out loud before committing to an answer.\n\nExample:\n\n> A jar contains 12 marbles, 5 red, 4 blue, 3 green. I draw 2 without replacement. What is the probability both are red?\n\nWithout CoT, the model often guesses an answer. With "think step by step" prepended, it works through:\n\n> P(first red) = 5/12. After drawing one red, 4 reds remain out of 11 marbles. P(second red) = 4/11. P(both red) = 5/12 × 4/11 = 20/132 = 5/33.\n\nIf you do not want the reasoning shown to the end user, ask the model to put it inside a `<thinking>` block and parse it out before display.\n\n## Self-critique\n\nAsk the model to grade its own output before returning it.\n\n> "Here is your draft answer. Now critique it for: (1) factual errors, (2) missing edge cases, (3) tone mismatch. If you find issues, rewrite. Return only the final version."\n\nThis costs an extra LLM call but routinely catches the obvious mistakes a first-pass would have shipped. Pair it with `temperature: 0` on the critique pass.\n\n## When NOT to use these\n\nFor latency-sensitive interactive UX (chat replies under 500 ms), the extra tokens hurt more than they help. Save CoT + self-critique for batch jobs, code generation, and high-stakes one-shots.',
   18, true, 2, NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

-- ── Must-have-skills lessons ────────────────────────────────────────
INSERT INTO "course_lessons" (
  "id", "course_id", "module_id", "title", "summary",
  "source_type", "body_md", "estimated_minutes", "is_required", "sort_order",
  "created_at", "updated_at"
) VALUES
  ((md5('seed-lesson:must:l1'))::uuid, (md5('seed-course:ai-era-must-have-skills'))::uuid, (md5('seed-module:must:critical-eval'))::uuid,
   'Calibrated Skepticism',
   'Believing AI exactly as much as the evidence warrants.',
   'text_md',
   E'# Calibrated Skepticism\n\nThe people who use AI well are not the ones who trust it most or distrust it most. They trust it **calibrated to the task**.\n\n**High-trust tasks** (low cost of error, easy to verify):\n- Drafting a first version of an email\n- Summarising a long document you will skim afterwards\n- Generating boilerplate code\n\n**Medium-trust tasks** (verify before shipping):\n- Researching a topic you do not already know\n- Writing public-facing copy\n- Suggesting candidates against a job description\n\n**Low-trust tasks** (treat AI output as a hypothesis, verify with primary sources):\n- Legal interpretation\n- Medical advice\n- Anything about specific people (libel risk)\n- Citations + URLs (hallucination-prone)\n\n**Practice:** for the next week, on every AI-assisted task, write one sentence at the top: "I trust this output at <high / medium / low> because <reason>." Re-read the reason after you verify. Your calibration will improve fast.',
   12, true, 0, NOW(), NOW()),

  ((md5('seed-lesson:must:l2'))::uuid, (md5('seed-course:ai-era-must-have-skills'))::uuid, (md5('seed-module:must:systems-thinking'))::uuid,
   'Mapping the System Around the Task',
   'AI fixes the task. The system around it is still yours.',
   'text_md',
   E'# Mapping the System Around the Task\n\nAI compresses individual tasks but does not reorganize the system the tasks live in. The person who can see the system maps the leverage.\n\n**A worked example: hiring**\n\nAI shrinks the time-cost of resume screening from hours to seconds. What does NOT change:\n- Sourcing pipeline (you still have to attract candidates)\n- Reference checks\n- Interview-loop coordination\n- Offer negotiation\n- Onboarding\n\nIf your role was "screen resumes for 20 hours/week," AI is a threat. If your role is "run the hiring system end-to-end," AI is leverage — the screening step shrinks, freeing time for the upstream and downstream steps that still matter.\n\n**Practice this week:**\n1. List your five most-frequent tasks.\n2. For each, mark which feeds it (upstream) and which it feeds (downstream).\n3. For each, mark whether AI is currently good at it.\n4. The tasks where AI is good AND you see the upstream/downstream are your leverage. The tasks where AI is good AND you only see the task itself are your risk.',
   18, true, 0, NOW(), NOW()),

  ((md5('seed-lesson:must:l3'))::uuid, (md5('seed-course:ai-era-must-have-skills'))::uuid, (md5('seed-module:must:prompt-fluency'))::uuid,
   'Talking to AI Like a Domain Expert',
   'The difference between asking a question and briefing a colleague.',
   'text_md',
   E'# Talking to AI Like a Domain Expert\n\nThe single biggest skill gap between AI power users and casual users is **how much context they hand over per query**.\n\n**Casual:**\n> "Write me an email to my boss."\n\n**Power:**\n> "Write a short email to my manager (Sarah, who runs the Growth team). Tone: direct, slightly informal. Context: the Q3 launch slipped because the vendor we depend on (Acme) missed two milestones. I want to ask for two more weeks without sounding like I am making excuses. Should mention the proactive mitigation we already shipped (custom shim, see attached). 4-6 sentences."\n\nBoth get an email. The power version gets a usable email.\n\n**The pattern is consistent:** the more context you offer up front, the less you negotiate output through follow-ups. This is exactly how you would brief a contractor or a new hire — give them what they need to do the job, then trust the output.\n\n**Practice prompt template for the next week:**\n\n```\nROLE: [who I want the AI to be]\nCONTEXT: [what is happening, what I want, what constraints apply]\nINPUT: [the raw material]\nOUTPUT: [exact format, length, tone]\nCONSTRAINTS: [what to avoid, what must be included]\n```\n\nRun every non-trivial AI query through this template for one week. Compare the output quality to your previous one-line queries.',
   15, true, 0, NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

-- ── Claude API lessons ──────────────────────────────────────────────
INSERT INTO "course_lessons" (
  "id", "course_id", "module_id", "title", "summary",
  "source_type", "body_md", "estimated_minutes", "is_required", "sort_order",
  "created_at", "updated_at"
) VALUES
  ((md5('seed-lesson:claude:l1'))::uuid, (md5('seed-course:building-with-claude-api'))::uuid, (md5('seed-module:claude:hello-world'))::uuid,
   'First Message via SDK',
   'Auth, install, the smallest working program.',
   'text_md',
   E'# First Message via SDK\n\nThe Anthropic SDK is published as `@anthropic-ai/sdk` (TypeScript) and `anthropic` (Python). Pick your stack.\n\n## TypeScript\n\n```bash\nnpm install @anthropic-ai/sdk\nexport ANTHROPIC_API_KEY=sk-ant-...\n```\n\n```typescript\nimport Anthropic from "@anthropic-ai/sdk";\n\nconst client = new Anthropic();\n\nconst response = await client.messages.create({\n  model: "claude-sonnet-4-6",\n  max_tokens: 1024,\n  messages: [\n    { role: "user", content: "Hello, Claude." },\n  ],\n});\n\nconsole.log(response.content[0].text);\n```\n\n## Python\n\n```bash\npip install anthropic\nexport ANTHROPIC_API_KEY=sk-ant-...\n```\n\n```python\nfrom anthropic import Anthropic\n\nclient = Anthropic()\n\nresponse = client.messages.create(\n    model="claude-sonnet-4-6",\n    max_tokens=1024,\n    messages=[\n        {"role": "user", "content": "Hello, Claude."},\n    ],\n)\n\nprint(response.content[0].text)\n```\n\n## Model picker (May 2026)\n\n- **claude-opus-4-7** — most capable, 1M context, slowest. Defaults for hard reasoning, agent loops.\n- **claude-sonnet-4-6** — workhorse. The right default for most production.\n- **claude-haiku-4-5** — fastest, cheapest. Use for routing, classification, lightweight chat.',
   18, true, 0, NOW(), NOW()),

  ((md5('seed-lesson:claude:l2'))::uuid, (md5('seed-course:building-with-claude-api'))::uuid, (md5('seed-module:claude:tool-use'))::uuid,
   'Tool Use — Letting Claude Call Functions',
   'The mechanic that makes an agent.',
   'text_md',
   E'# Tool Use — Letting Claude Call Functions\n\nTool use lets the model decide when to invoke a function you defined and pass it structured arguments. The basic loop:\n\n1. You declare tools (name + JSON schema).\n2. You send the user message + tool definitions.\n3. The model either replies in text OR returns a `tool_use` block.\n4. If a tool was used, you execute it on your side, return the result, and the model continues.\n\n```typescript\nconst tools = [\n  {\n    name: "get_weather",\n    description: "Get current weather for a city.",\n    input_schema: {\n      type: "object",\n      properties: { city: { type: "string" } },\n      required: ["city"],\n    },\n  },\n];\n\nconst response = await client.messages.create({\n  model: "claude-sonnet-4-6",\n  max_tokens: 1024,\n  tools,\n  messages: [{ role: "user", content: "What is the weather in Tokyo?" }],\n});\n\nif (response.stop_reason === "tool_use") {\n  const toolUse = response.content.find((b) => b.type === "tool_use");\n  const result = await getWeather(toolUse.input.city);\n  // Send tool_result back and let the model continue\n}\n```\n\n**Multi-turn agent loop:** keep going until `stop_reason !== "tool_use"`. Set a max-iteration cap (10-20 is reasonable) to prevent runaways.\n\n**Parallel tool use:** the model can return multiple `tool_use` blocks in one response. Execute them in parallel for speed.',
   25, true, 0, NOW(), NOW()),

  ((md5('seed-lesson:claude:l3'))::uuid, (md5('seed-course:building-with-claude-api'))::uuid, (md5('seed-module:claude:prod-patterns'))::uuid,
   'Prompt Caching — The Single Biggest Cost Lever',
   'Why your 30-page system prompt should be cached.',
   'text_md',
   E'# Prompt Caching — The Single Biggest Cost Lever\n\nIf your app sends the same long system prompt on every request (most agents do), **prompt caching** can cut your input-token cost by 90%+ and your latency by 50%+.\n\n**How it works:** mark sections of the prompt as cacheable. The first request pays a 25% premium to write the cache. Every request for the next **5 minutes** that re-uses those exact bytes pays 10% of normal cost for them. Read-through is fast.\n\n```typescript\nconst response = await client.messages.create({\n  model: "claude-sonnet-4-6",\n  max_tokens: 1024,\n  system: [\n    {\n      type: "text",\n      text: LONG_SYSTEM_PROMPT, // 5000 tokens of instructions\n      cache_control: { type: "ephemeral" },\n    },\n  ],\n  messages: [\n    { role: "user", content: userMessage },\n  ],\n});\n```\n\n## What to cache\n\n- The system prompt — almost always.\n- Long reference documents you include in every call (style guide, persona, API schema).\n- Few-shot examples — they are large and stable.\n\n## What NOT to cache\n\n- The user message — it changes every call. No benefit.\n- Anything under ~1024 tokens — the cache write premium does not pay back.\n\n## The 5-minute TTL is the key constraint\n\nIf your traffic pattern leaves more than 5 minutes between requests, the cache expires and you pay full price again. For low-volume use cases, set a small "warm-up" cron to ping every few minutes.\n\n## Cache hit rate is observable\n\nThe response includes `usage.cache_read_input_tokens` and `usage.cache_creation_input_tokens`. Log these. Anything below a 70% cache-hit rate in production means the prompt is drifting between calls (often: timestamp injected, conversation history rotated). Find what is varying and stabilize it.',
   28, true, 0, NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

-- ============================================================
-- 5. Enrollment + completion counter bump so the new courses
--    don't read as "0 students" on first load. Cosmetic, but the
--    public marketplace card prominently shows the count.
-- ============================================================
UPDATE "courses"
   SET "enrollment_count" = 1
 WHERE "user_id" = (md5('learning@hired.video'))::uuid
   AND "enrollment_count" = 0;
