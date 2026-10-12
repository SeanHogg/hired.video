# PRD — AI posting agent (Pro) · #2300

> Status: spec, 2026-10-11; first build pushed in 58587884 (CI red, not deployed); latest review §11.2: R12, R14 and R16 (agent posts upload the whole video) block the next push (owner decision D5 in [core-loop plan](../plans/2026-10-10-core-loop-plan.md) §5). Builds on
> [Social Media Publishing & Distribution](social-media-publishing-and-distribution.md) (#2043) and the scheduled-post
> queue (#2047, migration 0524). It adds no second queue, publisher or renderer.

## 1. Goal and promise

[ProUpsellCard](../../frontend/components/studio/v2/focus/ProUpsellCard.tsx) sells Pro ($1.99/month, `PRO_MONTHLY_PRICE`) with
three perks. The third, `studio.share.pro.agent`, reads: **"An AI agent that keeps posting fresh clips for you."** Each part of
that sentence becomes a commitment:

| Copy | Commitment |
|---|---|
| "keeps posting" | Posts go out on a weekly cadence, every week, until the user pauses it. |
| "fresh clips" | Each post is a new highlight window from one of the user's posted videos. The agent never re-posts a window it has already posted to that network. |
| "for you" | The agent picks the clip, cuts it for each network and writes the caption. All the user does is approve, in one tap. Auto-post is available as an opt-in. |

Job seekers stay visible to recruiters without having to remember to post. Each post also links back to the résumé or video
page, which feeds the Upload → Create → Promote loop.

**Non-goals for v1:**
- Generating new videos. The agent only cuts videos the user has already made.
- Posting to hired.video's brand channels (Lane A). That lane stays moderated and only the user can submit to it.
- Replying to comments.
- Paid boosts.

## 2. User flow

1. **Entry points.**
   - The perk line on ProUpsellCard links to the agent's settings.
   - The Distribution Hub (`/studio/distribution`) gets an **Agent** tab, deep link `?tab=agent`.
   - Free users see the tab locked, with the ProUpsellCard copy and the in-place upgrade (`useAuthGate` + upgrade, per the Pro rule).
2. **Turn on.** One card shows a switch, the channels, the cadence, the approval mode and the post time. Pressing **Start**
   saves the settings and runs the first plan straight away, inside the request (`waitUntil`). The user sees the first drafts
   within seconds.
3. **Channels.**
   - The feed (always available) and any network where the user's own account (`self` lane) is connected.
   - Networks that aren't connected, or that aren't live yet (#2299), can still be picked. They become "post it yourself" drafts (§8).
   - Default: the feed, plus every connected network.
4. **Cadence presets.** Slots are at the user's post time, in their `users.timezone`.

| Preset | Slots per week | Days |
|---|---|---|
| Light | 1 | Tue |
| **Steady (recommended default)** | 3 | Mon, Wed, Fri |
| Daily | 5 | Mon–Fri |

   - The default post time is **12:00 local**.
   - One slot is one clip, sent to every chosen channel.
   - There is no "custom" preset in v1. Three presets keep both the UI and the rate-limit maths small.
5. **Settings live in one place**: the Agent tab. That fits the rule for minimal in-flow customization: in the flow the agent
   is one line with two chips; everything else is in the tab.

## 3. Approval modes

- **Approve each post (default).**
  - Each weekly plan creates `draft` jobs and sends a single **digest**: bell, push and email.
    Example: "Your agent lined up 3 posts for this week."
  - The digest deep-links to the Agent tab. Each draft card shows:
    - a preview of the clip;
    - the caption for each channel, which the user can edit, with "Rewrite";
    - **Approve**, **Skip** and **Approve all**.
  - On approval the browser bakes the clip (§4), then calls `approve`. The job becomes `scheduled`.
  - The email can be turned off in the Agent tab. The bell can't.
- **Auto-post (opt-in).**
  - Turning it on needs one confirmation: "Posts will go out without asking you."
  - Feed drafts are created as `scheduled` straight away.
  - Network clips still have to be rendered in a browser, because there is no server render on Workers Free (D10/#669). The
    digest therefore says "Open to prepare this week's clips (one tap)". Opening the Agent tab bakes every pending clip in the
    background, and each one becomes `scheduled` with no further approval.
  - If a clip is never prepared, it expires. The agent never falls back to re-posting the master.
- **Expiry of unapproved drafts.**
  - A direct-post draft expires at its slot time. Slots are never moved: a late approval doesn't post on a different day.
  - A "post it yourself" draft expires 48 hours after its slot.
  - Expired drafts become `expired`. They drop out of every list and count only in the next digest ("1 post expired").
- **Undo window.**
  - Every agent job can be cancelled up to the moment it is claimed.
  - An approval made less than 10 minutes before the slot gets `run_at = now + 10 min` (`AGENT_UNDO_WINDOW_MIN = 10`).

## 4. What it cuts

1. **Candidates.** These are the user's video projects that meet all three conditions:
   - at least one row in `studio_project_publications`, meaning the user has posted the video themselves;
   - a hosted master that is fresh (`isProjectBakedFresh`);
   - not deleted.
2. **Rotation.**
   - Take the project the agent posted longest ago first. A project it has never posted counts as oldest. Break ties by the most recent publish.
   - **Cooldown:** the same project doesn't go to the same network again within 14 days.
3. **Clip length.**
   - The target is `AGENT_CLIP_SEC = 30`, limited by each network's preset (`PUBLISH_PLATFORM_PRESETS`, which allows at least 3 s).
   - A master of 45 s or less is posted whole. It is then "used" for that network until the user changes the video (a new `content_revision`).
4. **Choosing the window.** This runs in the browser at bake time, because `highlight-scoring.ts` needs an `HTMLVideoElement`.
   - `scoreHighlights()` runs over the master.
   - A new pure function, `pickFreshWindow(windows, clipSec, used)` in `shared/posting-agent.ts`, picks the highest-scoring
     window that doesn't overlap any already-posted window by more than 50%.
   - "Already posted" means the windows in the variant keys of this project's agent jobs that are `done` at the same content revision.
   - The window snaps to a scene boundary when there is one within 2 s.
   - Windows that score below 0.4 are skipped. If nothing qualifies, the project counts as exhausted for this revision.
5. **Per-network cut.**
   - The existing fitted-cut path is reused: `planPublishVariants` → `ensureVariant`, which writes `studio_project_render_variants`.
   - The variant key gains an optional start: `9x16-30s45` means a 9:16 frame, 30 s long, starting at 45 s. It still fits `VARIANT_KEY_MAX` (32).
   - One bake serves every network with the same aspect: one cut covers TikTok, Reels and Shorts.
   - Pro means no watermark (`variantRevision(..., branded=false)`).
6. **Caption.**
   - One gateway call per weekly plan, through the existing `generateSocialCaption` (`services/studio/social-caption.ts`, use case `linkedin_post`).
   - Batched: the call returns a hook, caption and hashtags for each (slot × channel), within each destination's `captionLimitFor`.
     A single call holds at most 20 captions.
   - It is labelled `posting_agent_caption`, so each call is one `ai_usage_records` row with that `feature_key`.
7. **Out of material.** When every candidate is in cooldown or exhausted, the plan creates nothing and the digest says
   "Your agent has run out of fresh clips. Make a new video?", linking to `/studio/new`.

## 5. Data model

Migration **`0NNN_posting_agent.sql`, number TBD (the coordinator assigns it)**. It is additive and idempotent, and every
index is declared in Drizzle (CI's `drizzle-kit push` drops indexes it doesn't know about).

**`social_publish_jobs` — reused, not a new table:**
- `source varchar(8) NOT NULL DEFAULT 'user'`, with `CHECK (source IN ('user','agent'))`. Existing rows read as `user`.
- The status CHECK gains `draft` and `expired`: `draft → scheduled | cancelled (Skip) | expired`.
  - Drafts fall outside `uq_social_publish_jobs_open`, which covers only scheduled and running jobs, and outside the drainer's claim, which takes only scheduled jobs.
  - If approving a draft collides with a job the user scheduled themselves, the API returns 409 `ALREADY_SCHEDULED`.
- **Meaning of `run_at` for drafts:** it is the expiry time. For a direct post that is the slot; for "post it yourself" it is the slot + 48 h.
  - `scheduled_at` is always the slot.
  - The expiry sweep reuses `idx_social_publish_jobs_status_run_at`, so no new column or index is needed.
- `post_settings.captionSource` is `'ai'` or `'template'` (§6). The clip window lives in the variant key, not on the job.
- Shared vocabulary goes in `shared/social-publish-jobs.ts`:
  - `PUBLISH_JOB_STATUSES` gains `draft` and `expired`;
  - a new view, `drafts: ['draft']`;
  - `publishJobView()` maps `expired` to no list.

**`posting_agent_settings` — new, one row per user:**

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid, primary key | FK to `users`, `ON DELETE CASCADE` |
| `enabled` | boolean | default `false` |
| `mode` | varchar(8) | `approve` or `auto`; default `approve` |
| `cadence` | varchar(8) | `light`, `steady` or `daily`; default `steady` |
| `post_minute` | smallint | 0–1439, local time; default 720 (12:00) |
| `destinations` | varchar(16)[] | Validated against `DISTRIBUTION_DESTINATIONS` in the app. It is a bounded set that is always read and written whole and never queried by element, so a child table buys nothing. |
| `quiet_start_minute`, `quiet_end_minute` | smallint | default 1260 and 480 (21:00–08:00) |
| `email_digest` | boolean | default `true` |
| `next_plan_at` | timestamptz | nullable |
| `paused_reason` | varchar(16) | nullable: `user`, `plan` or `admin` |
| `created_at`, `updated_at` | timestamptz | |

- Partial index `idx_posting_agent_settings_due ON (next_plan_at) WHERE enabled`.
- The timezone comes from `users.timezone` and is not copied (3NF).

**`studio_project_publications` — a required fix.**
- Today it is unique on `(project_id, destination)` and `recordPublication` upserts on that. A second clip of the same
  project on the same network would overwrite the first post's row, and with it the post's metrics (`external_post_metrics` hangs off the row).
- The fix: drop `uq_studio_project_publications_proj_dest` and create
  `uq_studio_project_publications_proj_dest_variant ON (project_id, destination, render_variant_id) NULLS NOT DISTINCT`.
  Postgres 16 on Neon supports this.
- `publication-service.ts` changes its conflict target to match.
- Readers that list "Published to" group by destination. `post-channel-gate.ts` already counts distinct destinations; a test pins that.

## 6. Cron and budget

**New step:** `processPostingAgent`, in `api/src/scheduled.ts`.
- It runs on **quarter ticks that aren't half ticks** (:15 and :45). Those ticks skip the scraper and the metrics sync, which leaves headroom in the 50-subrequest limit.
- It gets its own slice, `AGENT_SUBREQUEST_BUDGET = 12`, in `subrequest-budget.ts`.

**Each run:**
1. **Expiry sweep.** One `UPDATE … SET status='expired' WHERE id IN (SELECT … status='draft' AND run_at<=now LIMIT 50)`.
2. **Plan at most `AGENT_PLANS_PER_RUN = 1` user.**
   - Claim: `UPDATE … SET next_plan_at = next_plan_at + 7 days … FOR UPDATE SKIP LOCKED RETURNING`.
   - Then: a Pro check (`loadIsProForUsers`), the candidates read, a budget read (`tokenLedger.getBudget`), one LLM call, one insert of the jobs, and `emitNotification`.
   - That is about 9 subrequests. The LLM call waits on I/O, so CPU stays well under 10 ms.

**Planning window and capacity.**
- `next_plan_at` is anchored to when the user turned the agent on, so users spread across the week instead of all landing on Sunday.
- Each plan covers the slots in `[now + 12 h, now + 7 d + 12 h)`.
- The first plan, made inside the request, starts at `now + 1 h`.
- Capacity on Workers Free: 48 plans a day, about **330 weekly-active agent users**.
  - Past that, a plan is late but never lost: `next_plan_at` simply waits.
  - Scaling up means one more tick slot or Workers Paid. That is noted, not built.

**Sending.** Agent jobs go through the unchanged `processSocialPublishJobs` drainer, three jobs per run, under its existing budget.

**Token cost.**
- Estimate per weekly call: about 1,000 input tokens plus about 150 output tokens per caption.
  - Steady × 3 channels (9 captions): about 2.4K tokens a week, roughly 10K a month. That is about **7% of the 150K Pro allowance**.
  - Daily × 4 channels (20 captions): roughly 17K a month, about 11%.
  - Per post, that works out to roughly 250–300 tokens.
- "Rewrite" on a draft calls the existing `/social/generate-caption` route, which checks `checkTokenBudget`.
- The `ai-text-caller` gets a variant that takes a `userId`, because the cron has no JWT. It charges through `tokenLedger.charge` like every other call.

**When tokens run out.**
- If `hasTokensForAiCall(budget.totalAvailable)` is false, the plan still goes ahead with a **template caption**: the project title,
  the résumé headline or target role, the link, and the preset hashtags. No LLM is called, and `captionSource` is `'template'`.
- The digest says once per calendar month: "AI captions paused — out of tokens", with a link to token packs.
- Posting itself never costs tokens, and the agent never buys a pack.

**Pro lapse.** At plan time, a user who is no longer Pro is handled like this:
- the agent is switched off with `paused_reason = 'plan'`;
- all their open agent drafts and scheduled agent jobs are cancelled;
- they get a single notification that links to the upgrade.

## 7. Safety

- **Rate limits.** These apply to agent jobs only, are enforced at plan time and checked again at approval.
  - At most 1 agent post per destination per local day, and no more than the cadence's slots per week (at most 5).
  - **YouTube app-wide:** the Data API's default 10,000 units a day covers only a few uploads for the whole app. A shared
    counter, `AGENT_YOUTUBE_DAILY_MAX = 3`, keeps room for the user's own uploads. Beyond it, that slot's YouTube draft becomes "post it yourself".
  - **TikTok:** until the Content Posting audit passes (#2299), posts are private, so TikTok drafts are always "post it yourself".
- **Quiet hours.** Default 21:00–08:00 local.
  - The post-time picker won't accept a time inside quiet hours.
  - An agent job's retry backoff (`markRetry`) is pushed to the end of quiet hours.
  - Push notifications aren't sent during quiet hours; the bell still updates.
- **Kill switches.**
  - **Per user:** a **Pause** button on the Agent tab and a one-tap link in every digest email (signed token).
    Pausing sets `enabled=false, paused_reason='user'` and cancels every open agent job.
  - **Global:** a Worker var, `POSTING_AGENT_ENABLED`. When it is `false`:
    - the planner returns immediately;
    - the drainer's claim filter excludes `source='agent'`;
    - the Agent tab shows "temporarily paused".
  - **SuperAdmin:** can set `paused_reason='admin'` per user from `/admin/users`. The user can't resume it.
- **Undo and delete.**
  - Before a post is sent: cancel at any time, plus the 10-minute minimum window (§3).
  - After a feed post is sent: the existing feed delete.
  - After a network post is sent: the network adapters have no delete call in v1. The Hub's "Sent" row links to the post, labelled "Delete on <network>".
    Adding `delete()` to `SocialVideoPublisher` is deferred.
- **Content.**
  - The agent only posts cuts of videos the user has already published themselves.
  - Generated captions go through the same text limits (`postTextProblem`) as user captions.
  - Captions never mention an employer the user didn't name in the project.

## 8. Dependencies

- **#2297, Pro entitlement: done.** It was resolved on 2026-10-03 in DONE.md: `PRO_MONTHLY_PRICE = 1.99`, and `requirePro` with `isPro`
  is live. The allowance is now 150K (`PRO_AI_MONTHLY_TOKENS`). The gate is `requirePro("AI posting agent")` on the
  settings PUT. The cron uses `loadIsProForUsers`.
- **#2299, live network apps (D4, being provisioned by the owner).** What works before it lands:
  - **hired.video feed posts**: fully direct, and fully automatic in auto-post mode;
  - **YouTube**, and **LinkedIn** where connected: these already post through the shared publisher;
  - **TikTok, Instagram, X and Facebook**: "post it yourself" drafts. The `ManualUploadCard` flow covers these: download the
    cut, copy the caption, open the upload page, paste the link, then "Mark as posted" (`manual-post.ts`). That marks the job
    `done` and links the publication.
  - When a network's self lane reports itself configured, its drafts become direct automatically. No migration is needed.
- **D10/#669, server render.** Without it, network clips need a browser bake (§3). If server render ever lands, auto-post
  becomes hands-off with no schema change.

## 9. Acceptance criteria

1. A free user who calls `PUT /api/distribution/agent` gets 402 `PRO_REQUIRED`. The Agent tab shows the locked upsell.
2. A Pro user who turns on Steady with the feed and YouTube at 12:00 gets 3 `draft` jobs per channel inside the request,
   with `source='agent'`, at Mon/Wed/Fri 12:00 in `users.timezone` (unit test on the slot maths, DST included). They also get one digest notification.
3. The drainer never claims a `draft`. Approving a draft sets `scheduled` with `run_at = max(slot, now + 10 min)`. Skipping sets `cancelled`.
4. A draft that isn't approved becomes `expired` at its slot, or slot + 48 h for "post it yourself", through the cron sweep.
   It is never sent.
5. The planner never picks a project that went to the same destination within 14 days. `pickFreshWindow` never returns a window
   overlapping a posted window by more than 50%. Both are covered by pure tests with fixtures.
6. Two clips of one project posted to YouTube produce **two** `studio_project_publications` rows, each with its own metrics.
   Posting the master again still upserts one row.
7. The variant key `9x16-30s45` round-trips through `parseVariantKey`, and the existing keys (`9x16-full`, `16x9-140`) still parse.
8. One weekly plan writes exactly one `ai_usage_records` row with `feature_key='posting_agent_caption'`. With the budget below
   `AI_CALL_MIN_TOKENS`, drafts carry `captionSource='template'` and no LLM call is made.
9. One `processPostingAgent` run stays at or under `AGENT_SUBREQUEST_BUDGET`, with a counting fake DB (test). It plans at most 1 user and expires at most 50 drafts.
10. With `POSTING_AGENT_ENABLED=false`, the planner does nothing and no `source='agent'` job is claimed. User jobs still go out.
11. Pause cancels every open agent job for that user. A lapsed Pro gets `enabled=false, paused_reason='plan'` and a notification.
12. Auto-post: feed drafts are created `scheduled`. A network clip baked from the Agent tab becomes `scheduled` without approval.
    One that is never baked expires.
13. YouTube agent jobs app-wide don't go over `AGENT_YOUTUBE_DAILY_MAX` per UTC day. The rest become manual drafts.
14. The Agent tab works at 360 px. Every new string exists in en, es and fr-CA.

## 10. Work breakdown (one implementer, about 6–8 days, four commits)

**A. Shared rules and schema (day 1–2)**
- `shared/posting-agent.ts` (new): presets, `slotsForWeek(settings, tz, from, to)`, quiet-hours check, `pickFreshWindow`,
  rate-limit constants, `AGENT_*` constants. Tests in `shared/__tests__/posting-agent.test.ts`.
- `shared/social-publish-jobs.ts`: `draft` and `expired` statuses, `drafts` view, `PUBLISH_JOB_SOURCES`.
- `shared/publish-presets.ts`: an optional start in the variant key and `VariantSpec.startSec`, plus tests.
- `api/drizzle/0NNN_posting_agent.sql` (number TBD), `api/src/db/schema/distribution.ts` (source column, CHECKs, `postingAgentSettings`),
  `api/src/db/schema/studioPublications.ts` and `api/src/services/studio/publication-service.ts` (the unique key with the variant).

**B. API (day 2–4)**
- `api/src/repositories/postingAgentRepository.ts` (new): settings CRUD, `claimDuePlan`, the candidate query, `expireDrafts`,
  and `cancelOpenAgentJobs`.
- `api/src/repositories/socialPublishJobRepository.ts`: `approveDraft` and `skipDraft`; source in the list rows; the claim
  filter that excludes agent jobs when the global switch is off.
- `api/src/services/distribution/agent/plan-agent-posts.ts` (new, pure with dependency injection): rotation, cooldown, rate limits, building the jobs.
- `api/src/services/distribution/agent/agent-captions.ts` (new): the batched `generateSocialCaption` and the template fallback.
- `api/src/services/distribution/agent/process-posting-agent.ts` (new): cron wiring, Pro-lapse handling, the digest through `emitNotification`.
- `api/src/services/adapters/ai-text-caller.ts`: a `userId`-based caller. `providers.ts`: map the label `posting_agent_caption` → `linkedin_post`.
- `api/src/services/distribution/subrequest-budget.ts` (the agent slice), `drain-publish-jobs.ts` (quiet-hours backoff for agent jobs), and `api/src/scheduled.ts` (the step).
- `api/src/routes/distribution-agent.ts` (new; mounted in `app.ts` under `/api/distribution`):
  - `GET` and `PUT /agent`
  - `POST /agent/pause`
  - `GET /agent/pause/:token` (email one-tap)
  - `POST /jobs/:id/approve` (`{renderVariantId?, caption?}`)
  - `POST /jobs/:id/skip`
- `api/wrangler.toml`: `POSTING_AGENT_ENABLED = "true"`.
- Tests: the planner, the drainer's draft exclusion, the expiry sweep, the budget, the caption fallback, the publication upsert.

**C. Frontend (day 4–6)**
- `frontend/pages/studio/distribution/DistributionHub.tsx`: an Agent tab (`?tab=agent`).
- New, in `frontend/components/studio/distribution/agent/`:
  - `PostingAgentCard.tsx` (switch, channel chips, cadence, mode, time, Pause);
  - `AgentDraftList.tsx` (preview, captions, Approve / Skip / Approve all, manual drafts through `ManualUploadCard`);
  - `useAgentSettings.ts` and `useAgentDrafts.ts`;
  - `useAgentClipBaker.ts` (`scoreHighlights` → `pickFreshWindow` → `ensureVariant` with a start offset).
- `frontend/lib/studio/publish-variants.ts`: render from a start offset.
- `frontend/components/studio/v2/focus/ProUpsellCard.tsx`: for Pro users, the agent perk links to `?tab=agent`. The copy is unchanged.
- `frontend/public/locales/{en,es,fr-CA}.json`: the `studio.agent.*` keys.

**D. Close-out (day 6–8)**
- Live check on the Worker: turn the agent on, approve one feed draft and one YouTube draft, and see each sent once.
- Update ROADMAP #2300 and move the row to DONE.md.

## 11. Review of the first build (2026-10-11): must fix before push

A first build was written (later pushed in `58587884`; see §11.1 for the re-review). It covers settings, the draft, approve, skip and rewrite flow, the Pro gate, the SuperAdmin pause, the YouTube daily cap, TikTok "post it yourself", the 14-day cooldown and the template-caption fallback. The coordinator's review found the problems below. **Do not push until R1–R5 are fixed and a Sonnet run of the API and frontend typecheck, tests and migration lint is green.**

### Blockers

- **R1. Publishing breaks.**
  - Problem:
    - `0528_posting_agent.sql` drops `uq_studio_project_publications_proj_dest` and creates `uq_studio_project_publications_proj_dest_variant`.
    - `publication-service.ts` still upserts with `onConflictDoUpdate({ target: [projectId, destination] })`, so every publish fails with "no unique or exclusion constraint matching the ON CONFLICT specification".
    - The schema (`studioPublications.ts`) still declares the old index and not the new one, so the CI `drizzle-kit push --force` re-creates the old index and drops the new one.
  - Fix, all in one change:
    - declare the new index in the schema with `.nullsNotDistinct()` and remove the old one;
    - change the upsert target to `[projectId, destination, renderVariantId]`;
    - make the migration drop the old index only after the new one exists;
    - add `-- @owner-gated` and a duplicate-audit query, because the new index fails to build if duplicate rows exist.
- **R2. Draft inserts fail.**
  - Problem: the migration drops `chk_social_publish_jobs_status`, but migration 0524 named the constraint `social_publish_jobs_status_check`. The old CHECK stays and rejects `'draft'` and `'expired'`.
  - Fix: drop and re-add `social_publish_jobs_status_check`, the name the schema declares.
- **R3. The migration isn't idempotent, and its constraint names drift from the schema.**
  - Problem:
    - `ADD CONSTRAINT chk_social_publish_jobs_source` and `chk_social_publish_jobs_caption_source` have no guard, so a re-run errors;
    - their names differ from the schema's (`social_publish_jobs_source_check`);
    - the `caption_source` CHECK isn't declared in the schema at all.
  - Fix:
    - use the schema's names;
    - guard each add with `DO $$ … IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = …)`;
    - declare the `caption_source` check in `distribution.ts`;
    - drop the explicit `BEGIN`/`COMMIT` unless the runner expects them (check against 0505/0511/0513).
- **R4. The schema and the migration disagree on types.**
  - Problem:
    - `destinations` is `varchar(16)[]` in the SQL but `jsonb` in the schema;
    - `post_minute`, `quiet_start_minute` and `quiet_end_minute` are `smallint` in the SQL but `integer` in the schema;
    - the partial index is `idx_posting_agent_settings_due (next_plan_at)` in the SQL but `idx_posting_agent_settings_enabled_next_plan (enabled, next_plan_at)` in the schema;
    - the CHECK constraints on `mode`, `cadence` and `paused_reason` are inline and unnamed in the SQL but named in the schema.
  - Fix: pick one form for each and make the SQL match the schema exactly, because the CI push alters whatever differs on a live table. Suggested choices:
    - `destinations` as `varchar(16)[]` (`varchar(...).array()` in drizzle);
    - `smallint` for the three minute columns;
    - the schema's index name and the schema's named CHECKs.
- **R5. The pause link can be forged, and gets triggered by link scanners.**
  - Problem:
    - `agent-pause-token.ts` reads `process.env.JWT_SECRET` and falls back to the literal `"dev-pause-token"`. Nothing else in `api/src` reads the secret this way.
    - `GET /posting-agent/pause-link` changes state, so email link scanners that prefetch links would pause the agent on delivery.
  - Fix:
    - sign with the single reader in `utils/jwt.ts` (`getJwtSecret()`) and fail closed when it's unset;
    - make the GET return a small confirm page (localized) that POSTs the pause;
    - give the token its own purpose prefix, for example `pause:` in the HMAC body, so it can't be swapped for another HMAC-signed token.

### Spec items not built yet

- **R6. Weekly digest email (§3).**
  - Missing: no sender exists; only the pause token is built.
  - Build: the digest of pending drafts, with approve/skip deep links and the pause link, sent on the planning tick. It respects `email_digest` and the notification preferences (`shared/notification-preferences.ts`).
- **R7. Highlight cutting (§4).**
  - Missing: the planner takes up to 5 recent projects and posts them whole.
  - Build: the 30 s highlight window chosen with `highlight-scoring.ts`, never the same window twice. Record the window on the job, for example in `post_settings`, so repeats can be detected.

### Should fix

- **R8. Layering.**
  - Problem: `routes/distribution.ts` and `routes/superadmin/users.ts` import `postingAgentSettingsRepository` and `socialPublishJobRepository` directly.
  - Fix: add a posting-agent use case module that the routes call. Also move the pause-and-cancel pair, which appears 3 times, into it.
- **R9. File size.**
  - `PostingAgentTab.tsx` is 472 lines. Split it into settings, the drafts list, and a hook with a typed client.
  - `routes/distribution.ts` is 402 lines. Move the agent routes into `routes/distribution-agent.ts`.
- **R10. Usage reporting.**
  - Problem: `posting_agent_caption` maps to the `linkedin_post` use case.
  - Fix: give it its own `USE_CASE_PROFILES` entry so its cost shows separately in `ai_usage_records`.
- **R11. Migration number.** 0528 was reserved for the structured builder runtime (T0.1). That's fine; T0.1 moves to the next free number.

### 11.1 Re-review (2026-10-11, after commit `58587884` and the working-tree fixes)

The first build was **pushed** in `58587884`. Its CI run failed, so the deploy was skipped and 0528 has **not** run in production; it is still safe to edit. The last three pushes all failed CI, so production is still on `fab89c68`.

**Status of R1–R11:**

| Item | Status | Notes |
|---|---|---|
| R1 Publications key | ✅ Fixed | `unique(...).nullsNotDistinct()` is declared in the schema, the upsert target includes `renderVariantId`, and the migration adds the new constraint before dropping the old index. It is owner-gated, with a duplicate audit that refuses to run on duplicates. See R12 for the readers this change affects. |
| R2 Status CHECK name | ✅ Fixed | Drops and re-adds `social_publish_jobs_status_check`. |
| R3 Idempotent, names | ✅ Fixed | Every add is guarded by `pg_constraint`, the names match the schema, the `caption_source` check is declared, and there's no BEGIN/COMMIT. `migration-0528.test.ts` was added. |
| R4 Type drift | ✅ Fixed | `varchar(16)[]` and `smallint` in both the SQL and the schema; the index and CHECK names match. |
| R5 Pause link | ✅ Fixed | `getJwtSecret()`, a `pause:` purpose prefix, a GET confirm page and a POST that pauses. The token is HTML-escaped in the form action. |
| R6 Digest email | ◐ In progress | `agent-digest.ts` and `agent-digest-live.ts` exist and are called from the planner. Not reviewed yet: the approve/skip deep links and the preference check end to end. |
| R7 Highlight cutting | ❌ Open | The planner still posts whole projects. |
| R8 Layering | ◐ Partial | The agent routes moved to `routes/posting-agent-routes.ts`, but it and `routes/superadmin/users.ts` still import both repositories directly. The disable-and-cancel pair is still repeated 3 times. Add one `pausePostingAgent(userId, reason)` use case. |
| R9 File size | ◐ Partial | `routes/distribution.ts` is now 390 lines ✅. `PostingAgentTab.tsx` is still 472 lines and `process-posting-agent.ts` has grown to 363. Split the tab (settings, drafts list, hook) and move digest sending out of the planner. |
| R10 Usage profile | ✅ Fixed | The `posting_agent` use case has its own profile. |
| R11 Migration number | ✅ Noted | T0.1 moves to the next free number. |

**New findings:**

- **R12. Publication readers still assume one row per project and network (blocker).** Now that a project can have one row per cut on the same network:
  - `unpublish(projectId, destination)` in `publication-service.ts` deletes **every** cut's row on that network;
  - `getPublication(projectId, destination)` reads with `.limit(1)` and no order, so it returns an arbitrary cut's link and status;
  - the cooldown lookup in `socialPublishJobRepository.ts` (around line 242) is correct as a yes/no check;
  - `listPublications` now returns several rows per destination, so check that the Post dock and publication chips don't show duplicates.

  Fix: take `renderVariantId` (or the publication id) in unpublish, order `getPublication` by `publishedAt desc` or take the variant, and dedupe per destination in any UI that shows one chip per network.
- **R13. CI blockers in the posting-agent code.**
  - Frontend typecheck: `PostingAgentTab.tsx:390`. `onRewrite` passes `rewritePostingAgentDraft(...)`, which returns `Promise<{ rewritten; caption? }>`, where `run` expects `() => Promise<void>`. Wrap it: `async () => { await …; }`.
  - API test "CHECK constraints — migrations vs schema (#2388)" failed on the first version of 0528. Re-run it on the fixed migration.
- **R14. The owner gate doesn't hold back the schema push.** 0528 is owner-gated, but the deploy's `drizzle-kit push` builds the same unique constraint from the schema, so the duplicate audit has to come **before the next push**, not before approving the SQL. Either:
  - (a) run the audit query in 0528's header now, before pushing; or
  - (b) split 0528, keeping the additive parts (columns, settings table, CHECKs) un-gated and moving the publications constraint, plus its schema change, into a separate owner-gated migration.

  (a) is simpler if the audit returns 0 rows.
- **R15. The pause pages hardcode colours.** `agent-pause-page.ts` inlines `#18181b`/`#fff` and has no dark mode. Server-rendered HTML can't use the app's tokens, but add a `prefers-color-scheme: dark` block so the page reads in both themes. The copy being in the module, not the locale JSON, is fine for a server page because it's localized for all three locales.

**Fixed by the coordinator during this review (outside the posting-agent files; these also failed CI on `58587884`):**
- `api/src/routes/studio.ts:2688`: an extra `)` in the cached `/projects/public` handler (from WP-D3) broke the API typecheck and ESLint.
- `api/src/services/paid-media/adapters/bing/reporting.ts`: a useless `\-` escape, and a literal BOM in a regex replaced with `﻿` (ESLint errors).
- The committed `frontend/public/sitemap.xml` and `templates-manifest.json` were stale, which failed two sitemap tests. Regenerated with the build's generator scripts.

**Before the next push:** fix R12, R13 and R14(a or b). Then have a Sonnet agent run, and get green results for: the API typecheck plus migration lint, API tests (including `migration-0528.test.ts`), the frontend typecheck, frontend tests, and ESLint for both API and frontend.

### 11.2 Third review (2026-10-11, 13:20; working tree on top of `75311f57`)

Still uncommitted, and the builder is still editing. Nothing below has been typechecked or tested.

**Status of the open items:**

| Item | Status | Notes |
|---|---|---|
| R6 Digest email | ✅ Built | `agent-digest.ts` and `agent-digest-live.ts`. It is sent from the planner in approve mode. It respects `email_digest` and the email/push channel preferences, and push is suppressed in quiet hours. The email links to the Hub and the pause page; there are no per-draft approve/skip links, which is acceptable because approving happens in the Hub. |
| R7 Highlight cutting | ◐ Clip chosen, not posted | `selectAgentClip` picks a fresh window, snaps it to a chapter start and skips windows that overlap past posts. The windows come from `windowsFromDuration`, which slides evenly over the video, not from `highlight-scoring.ts`. **See R16: the chosen clip is never used when posting.** |
| R8 Layering | ◐ Partial | The new `pause-posting-agent.ts` use case removes the pause-and-cancel duplication ✅, and the SuperAdmin route uses it. `routes/posting-agent-routes.ts` still imports `postingAgentSettingsRepository` and `socialPublishJobRepository` directly. Move settings, draft listing and approve/skip behind a posting-agent use case module. |
| R9 File size | ✅ Mostly fixed | The tab is split: `PostingAgentTab` 102 lines, `PostingAgentSettingsCard` 178, `PostingAgentDrafts` 163, plus the `usePostingAgent` hook at 175. `routes/distribution.ts` is 198 lines. `process-posting-agent.ts` is 361: under the limit, but it plans, picks clips, writes captions and sends the digest. Split out clip picking (`pickProjectForDest`, `loadSceneStarts`) when it is next touched. |
| R12 Publications, one row per cut | ❌ Open, blocker | `removePublication(projectId, destination)` still deletes every cut's row on that network. `getPublication(projectId, destination)` still does `.limit(1)` with no order. |
| R13 Tab typecheck | ✅ Fixed | The rewrite call is awaited inside the wrapper. |
| R14 Owner gate vs schema push | ❌ Open | Run the duplicate audit before pushing, or split the publications constraint into its own migration. |
| R15 Pause page dark mode | ✅ Fixed | A `prefers-color-scheme: dark` block was added. |

**New findings:**

- **R16. Agent posts upload the whole video, not the clip (blocker for the §1 promise).**
  - Problem:
    - The planner stores `postSettings.clip` and `postSettings.variantKey`, but leaves the job's `renderVariantId` null.
    - `send-publish-job.ts` picks the media from `job.renderVariantId` (`currentCutVideoId`) and otherwise falls back to the master video.
    - Nothing reads `postSettings.clip`, so every approved or auto post uploads the full-length video to every network.
  - Fix, as §4 and §6 already require: clips are cut in the browser, so add the weekly "prepare" step.
    - The Hub's drafts list shows "Prepare clips". It cuts each draft's window into a `studio_project_render_variants` row through the existing render-variant pipeline and sets `render_variant_id` on the job.
    - Approve, and auto-post, must refuse a network job that has no prepared variant, except for "post it yourself" jobs and feed posts.
    - Add a test: a job with a clip but no variant can't be sent.
- **R17. Captions are written from the title only.**
  - Problem: `captionSource` sets both `transcript` and `resumeText` to `pick.project.title`. §4 says the caption comes from the clip's transcript, and the project's video already has one.
  - Fix:
    - pass the transcript text that falls inside the clip window, with the résumé headline or summary as a fallback;
    - keep the prompt input bounded, about 1,500 characters, so the caption call stays within the token estimate in §6.
- **R18. A draft that hits the daily cap gets stuck.**
  - Problem: `gate-agent-draft.ts` re-checks the daily cap on approve, which is correct. But the route only returns 429, so the draft stays in `draft` and keeps showing in the Hub until it expires, with no way to approve it.
  - Fix: on a "capped" result, move the draft to the next free slot, or mark it `expired` with a reason that the Hub shows.

**Before the next push**
- Fix R12, R16 and R14.
- Then have a Sonnet agent run, and get green results for: the API typecheck plus migration lint, API tests (including `migration-0528`, `process-posting-agent`, `pause-posting-agent`, `caption-fallback` and `agent-digest`), the frontend typecheck, frontend tests (`PostingAgentTab.test.tsx`), and ESLint for both API and frontend.
- R17 and R18 can follow, but before the agent is switched on for users.

## Owner input (optional; defaults above stand if unanswered)

- Request a higher YouTube Data API quota for the Google Cloud project. Until then the agent caps itself at 3 YouTube uploads a day across the whole app.
