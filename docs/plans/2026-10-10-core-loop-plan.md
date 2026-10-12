# Core-loop implementation plan — remaining ROADMAP work

**Date:** 2026-10-10 · **Owner / auditor:** the coordinating session (Opus) · **Source:** [ROADMAP.md](../../ROADMAP.md) Consolidated Gap Register (99 core-loop rows + 493 OTHER/Deferred)

This plan turns the open ROADMAP rows into **work packages (WPs)** that implementing agents can pick up one at a time. Each WP lists its rows, the files it owns, the contract it must meet, how it is accepted, and what blocks it. The coordinator dispatches the WPs, audits each report, runs verification and closes the rows into [DONE.md](../../DONE.md).

The product loop is **Upload → Create → Promote**, and it is generic across résumés, jobs, companies and profiles. A WP is in scope only if it moves a user through that loop. Everything else waits in Wave 4.

---

## 1. Roles

| Who | Does | Never does |
|---|---|---|
| **Coordinator** (this session, Opus) | Dispatches WPs. Edits the shared files (§3). Assigns migration numbers. Reviews every diff. Moves rows ROADMAP → DONE.md. | Hands a WP over without acceptance criteria. Closes a row on a typecheck alone. |
| **Implementer** (one Opus agent per WP) | Writes the code, tests, i18n keys and migration for its WP, within the files it owns. Returns the report in §6. | Edits ROADMAP.md or DONE.md. Edits files another WP owns. Commits or pushes. Runs typecheck or tests itself (see Verifier). |
| **Verifier** (Sonnet agent) | Runs the typecheck, tests, lint and dry-run build commands in §7 and reports pass/fail with output. | Reviews the design. Fixes code. |
| **Owner** (the user) | Makes the decisions in §5. Pushes and deploys. Does the browser checks that need a real account. | — |

Because work happens **directly on `main` in one working copy** (no feature branches), **at most three implementers run at once**, and only when their file sets don't overlap (§4 lists which WPs can run together). Another session also edits this repo. Every implementer must re-read a file right before editing it and never revert changes it did not make.

---

## 2. Agent contract (applies to every WP)

Paste this section into every implementer brief.

1. **The Workers Free plan is permanent.** The API runs on Cloudflare Workers Free: 10 ms CPU per request, the same 10 ms per cron run, a 1 s startup limit, 128 MB of memory and 50 subrequests per request.
   - Do no heavy work at module load (no regex tables built up front, no large imports).
   - Add no new API dependency over ~50 KB without saying why in the report.
   - Cron jobs handle a bounded batch per run and keep the rest for the next run.
   - Expensive work (encoding, OCR, image models) runs in the browser or through the AI gateway, never inside the Worker.
   - A new route module that will see real traffic must be listed in the report so the coordinator can add it to `api/src/hot-routes.ts`.
2. **Layering.**
   - Routes call an application service or port, never a table or vendor client directly.
   - Components call a typed client, never `fetch` inline.
   - One module, one reason to change. A file growing past ~400 lines must be split in the same pass.
   - No catch-all `*Service.ts` or `*Utils.ts`.
3. **DRY.**
   - Logic that appears in two places becomes one shared function, hook or component, and every copy is migrated in the same pass.
   - Shared components decide their own visibility. Don't prop-drill `canX` booleans.
4. **Caching.** Every new read endpoint goes through `getOrSetCached` (L1 + KV) and is invalidated on write, or the report says why it can't be. No N+1 queries, no unbounded lists, no ad-hoc `Map` caches.
5. **Database.**
   - New migration files only, using the number this plan assigns (§3.2). Never edit an applied migration; the runner now rejects any change to one by SHA-256.
   - Declare every index, including unique ones, in `api/src/db/schema/*` with the same name, because `drizzle-kit push --force` drops undeclared indexes.
   - Keep the schema in 3NF. A new kind of thing is a column value, not a new table.
6. **Frontend.**
   - Every new user-facing string goes through `t()`, with the same flat key added to `frontend/public/locales/{en,es,fr-CA}.json` and real Spanish and French-Canadian translations.
   - Colours come from theme tokens only; the page must read correctly in light and dark mode.
   - No horizontal overflow at 360 px.
   - A new page wraps `<AppShell>` and calls `useSEO` and `useBreadcrumbs`.
7. **Tests use real fixtures.** Cover the happy path, a boundary case and an error case, with data shaped like production data. Never flush fire-and-forget work with `setTimeout`.
8. **Dead code.** When a WP replaces something, delete the old code once a grep across `frontend/`, `api/` and `shared/` shows no references. Delete only what the WP replaced.
9. **Paid AI is Pro.** A new paid-AI action goes through `useAuthGate` plus the in-place $1.99 upgrade. Cost is recorded in `ai_usage_records`.
10. **Finish the whole slice.** Each feature ships end to end: data, API, client, UI and the place a user actually reaches it. If something is truly blocked, revert the partial wiring and name the single blocker in the report.
11. **Don't overclaim.** "Done" means the acceptance checks in the WP pass. Anything that can only be confirmed in a browser or on the live Worker goes under *Unverified* in the report.

---

## 3. Coordination rules

### 3.1 Files only the coordinator edits

Implementers who need a change in one of these put the exact snippet in their report, and the coordinator applies it:

- `api/src/app.ts` (route mounts), `api/src/hot-routes.ts`, `api/src/worker.ts`, `api/wrangler.toml`
- `api/src/db/schema/index.ts`, `api/src/repositories/index.ts`, `api/src/services/apiDeps.ts`
- `shared/api.ts`, `shared/validation.ts`, `shared/projection.ts`
- `ROADMAP.md`, `DONE.md`, `.github/**`

Implementers **may append** to `frontend/public/locales/*.json` within their own key namespace (e.g. `upload.*`, `build.*`, `publish.*`). They must never reorder or rewrite other keys.

### 3.2 Migration numbers

The per-track blocks in the ROADMAP Isolation table (0300–0519) are stale; the repo is already at **0511**. Use these numbers instead:

| Number | WP | Purpose (the implementer confirms the table doesn't exist yet) |
|---|---|---|
| 0512 | WP-B | `uploaded_assets`: one row per R2 object a user uploads (#733) |
| 0513 | WP-C | Review aggregate gets a polymorphic subject (`subject_type`, `subject_id`) (#2254) |
| 0514 | WP-G | `social_publish_jobs` queue (#2047) |
| 0515 | WP-G | `external_post_metrics` (#2048) |
| 0516 | WP-H | Polymorphic ad target (`content_type`, `content_id`) on ads (#176) |
| 0517 | WP-A | `token_pack_purchases` pending/confirmed state for the reconcile safety net (#2352), only if no existing table holds it |
| 0518 | WP-A | Dedupe + recreate the 30 unique indexes (#2305). Written now; the owner runs it only after D2 |
| 0519–0521 | taken | Used by the owner's own commits on 2026-10-10: 0519 pitch studio projects, 0520 fold résumé templates into studio templates, 0521 drop `linkedin_accounts` |
| 0522–0525 | spare | The coordinator assigns these on request. Run `ls api/drizzle` first, because parallel sessions also take numbers |

### 3.3 Duplicate gap IDs

> **Resolved 2026-10-10 (#2251):** the TK4 halves of #2346 and #2237 were already closed in that day's bug sweep, so #2346 and #2237 now refer only to the persuasion and ShareMenu rows. The other duplicates were renumbered (#2365–#2372), and `scripts/check-gap-ids.mjs` runs in CI.
>
> **Later the same day:** a parallel hygiene pass renumbered the persuasion row to **#2373** (now closed in DONE.md) and the ShareMenu row to **#2374**. In WP-G1 below, read #2237-share as **#2374**. `check-gap-ids.mjs` only sees table rows (`| id |`), not IDs declared in DONE.md bullets, so take the next free ID from a grep of both files.
>
> **Scope drift, 2026-10-10:** the same sweep (DONE.md, "Upload → Create → Promote bug sweep") closed #742 #476 #479 #583 #1991 #563 #2228 #2229 #1658 #887 #1968 #1140, narrowed #2242, and moved #2342/#2309/#2346-parse to post-deploy checks. Briefs for every WP must remove those rows.

Two IDs are used by two different rows each: **#2346** (the streamed parse row in TK4 and the persuasion-layer row in TK11) and **#2237** (the webcam resolution row in TK4 and the ShareMenu row in TK11). When the coordinator first touches them, it renumbers the TK11 rows to the next free IDs. Until then, this plan refers to them as #2346-parse, #2346-persuasion, #2237-webcam and #2237-share.

---

### 3.4 Audit status, 2026-10-10 evening (read before dispatching anything)

Work so far skipped the §7 review and verification gates. What that caused, and the rules from here:

- **Production API has not deployed since 4ff4a598.** Every CI run stops at "Re-push DB schema" (#2386). The push path is now fixed in code: push touches declared tables only, runs without `--force` (drops stop CI), pre-creates missing UNIQUE constraints without deleting rows, and the runner holds `-- @owner-gated` files. Nothing else should be pushed until one CI run deploys cleanly.
- **0518 already ran in production without approval** (#2387). D2 is moot for it; its follow-ups are owner decisions.
- **Reopened:** #2342, #2309, #2346 (closed before deploy); #563, #742/#583 (narrowed scope); #1658 (no browser check). New: #2388 undeclared CHECKs, #2389 WP-C tests, #2390 unmetered OCR, #2391 pitch leak.
- **Out of plan, awaiting the owner:** migrations 0519 (pitch), 0520 (template fold: drops `is_premium`, strands template rows with no creator) and 0521 (drop `linkedin_accounts`) took unassigned numbers; the pitch surfaces pre-empt D7.
- **Rules restated:** an implementer never edits ROADMAP.md/DONE.md, never takes a migration number, never closes a row; every WP ends with the §6 report, the coordinator's review, and the Sonnet verify. A data-changing migration must carry `-- @owner-gated` on its own line.

## 4. Waves and dispatch order

| Wave | WPs | Can run together? | Why this order |
|---|---|---|---|
| **0** | WP-0 (coordinator + owner) | — | The loop is down until the CPU fix and the AI key are live. Nothing else can be checked in production before that. |
| **1** | WP-A, WP-B, WP-C, WP-I | Run A+B+I together, then C. B and C both touch résumé upload/merge, so they run one after the other. | These fix the front of the loop: entry, upload and the /build workspace. |
| **2** | WP-D1, WP-E, WP-G1 | Run D1 alone first, then E and G1 together. D1 and E both touch the studio player and renderer. | Video output has to match the preview, and V1 has to go, before publishing at scale. |
| **3** | WP-D2, WP-G2, WP-H | D2 + H together, then G2. | Canvas unification and paid promotion build on Wave 2. |
| **4** | WP-D3, WP-F | One at a time. | Moving every entity into the studio and the video-AI features are the largest, most vendor-dependent items. |
| **5** | OTHER / Deferred | — | Triage only (§8). |

---

## 5. Decisions and blockers the owner must clear

Each of these blocks the named rows. The coordinator asks about them at the start of the matching wave.

| # | Decision or action | Blocks |
|---|---|---|
| D1 | Push to `main` and deploy, then run `wrangler tail` for 30 minutes of traffic. | #2342, #2309 (Wave 0) |
| D2 | Run the duplicate-finding queries for the 30 unique indexes against production, and approve the dedupe (it deletes duplicate rows). | #2305 |
| D3 | Make one real Helcim token-pack purchase in production so the field names can be confirmed. | #2352 (the reconcile safety net can still be built) |
| D4 | Developer-app credentials and app review for TikTok, Instagram, X and the Facebook Page. Also decide whether TikTok's watermark is acceptable. | #2299, #2052, the Lane A parts of #2045 and #2048 **Decided 2026-10-11:** YES: the owner provisions the developer apps and secrets. The TikTok watermark question is still open. |
| D5 | Spec for the "AI agent that posts for you": how often it posts, what it cuts, and how the user approves. | #2300 **Decided 2026-10-11:** YES: spec at `docs/prd/ai-posting-agent.md`, then build. |
| D6 | Boost pricing: flat slot fee (as built today) or a bid auction. | #1764; WP-H assumes flat until told otherwise **Decided 2026-10-11:** BOTH: keep the flat slot fee and add a bid auction (WP-H2). |
| D7 | Where the recruiter-facing video pitch appears (inbox card, public profile, or both). | #2133, #1237 **Decided 2026-10-11:** On the recruiter marketing features page, as a link into the studio that opens the recruiter themes (WP-F). |
| D8 | A brand-colour source for companies not on the platform (logo-colour extraction or an enrichment vendor). | #2355(a) **Decided 2026-10-11:** Fall back to the hired.video brand colours (WP-F). |
| D9 | Enable Cloudflare Images on account 649c… (free tier). | #2356(a) |
| D10 | #669 (server-side render workers) cannot run on Workers Free. Keep client-side encoding and move #669 to Won't-fix? | #669 |
| D11 | Vendors and cost for the AI avatar (#134) and eye-contact correction (#137). The free browser paths (RNNoise for #136, MediaPipe for #138) need no decision. | #134, #137 **Decided 2026-10-11:** Builderforce.ai gateway (WP-F). |
| D12 | Who is billed for a partner SDK upload's AI parse: the partner or the end user. | #2270 |
| D13 | Builderforce SDK support for a raw PDF `document` part. This is a change in another repo. | #2308 |

---

## 6. Work packages

Each WP block has: **Rows**, **Goal**, **Owns** (files the implementer may edit), **Contract**, **Acceptance**, **Blocked parts**.

### WP-0 — Foundations live check (coordinator + owner)

- **Rows:** #2342, #2309, #2346-parse
- **Goal:** Confirm in production that the API no longer returns 1102/503 and that AI calls succeed.
- **Steps:**
  1. Owner deploys (D1).
  2. Coordinator reads `wrangler tail` and `request_logs` for status-503 bursts.
  3. Call `POST /api/ai/chat` and confirm a reply, not `AI_AUTH_FAILED`.
  4. Upload a multi-page scanned PDF on /build and confirm parse events arrive one by one rather than all at the end.
- **Acceptance:** No 1102 errors in 30 minutes of traffic, an AI reply returns, and parse events stream. Then the coordinator closes #2342, #2309 and #2346-parse.
- **If 1102 persists:** run `wrangler check startup` and list the modules that still initialize inside a request. Add them to `hot-routes.ts` if startup stays under 1 s; otherwise shrink their top-level init.

### WP-A — Never lose work + payment safety (TK1/TK2)

- **Rows:** #2242, #1991, #1494, #2352 (code part), #2305 (code part)
- **Goal:** A user's edits survive multiple tabs, going offline, a PWA update and a session expiry. A paid-but-unconfirmed token pack is never lost.
- **Owns:**
  - `frontend/hooks/useServerAutosave*`
  - `frontend/components/PWAUpdatePrompt.tsx`
  - a new `frontend/lib/unsaved-work.ts`
  - the résumé-editor autosave hook
  - `api/src/services/billing/payment/**` and the token-pack route
  - schema for 0517
  - for #2305: the unique-index declarations in `api/src/db/schema/*` plus a new dedupe SQL file
- **Contract:**
  - **One unsaved-work registry** (`registerUnsavedWork(key, isDirty)`) that every editor uses. `PWAUpdatePrompt` defers its reload while anything is dirty, and `beforeunload` uses the same registry. (#1991)
  - **Server autosave:**
    - sends a version token, so a stale write gets a 409 and the user is shown a "newer copy in another tab" choice;
    - uses a `BroadcastChannel` so other tabs know about the save;
    - retries offline saves with backoff from an IndexedDB queue that is flushed on `online`. (#2242)
  - **Résumé keystroke autosave** reuses the same hook against `POST /api/resumes/:id/versions {isAutosave:true}`. It does not get a second debounce implementation. (#1494)
  - **Token packs:** the purchase is stored as `pending` before the Helcim check. A bounded cron step in the existing 5-minute cron (≤10 rows per run) re-checks pending purchases and credits approved ones. The credit is idempotent per transaction id. (#2352)
  - **#2305:**
    - write `api/drizzle/0518_dedupe_unique_indexes.sql`, holding the dedupe followed by the `CREATE UNIQUE INDEX IF NOT EXISTS` statements;
    - declare the unique indexes in the schema;
    - **do not run it.** The owner runs it after D2.
- **Acceptance:**
  - Unit tests for the registry, the 409 conflict path, the offline-queue flush, and an idempotent double credit.
  - The two-tab conflict is shown, localized, in the UI.
- **Blocked parts:** a live Helcim run (D3) and the production dedupe (D2).

### WP-B — Upload robustness (TK4/TK5/TK7)

- **Rows:** #2228, #2229, #2233, #2230, #2270, #733, #950, #563, #2237-webcam, #1787, #2356(b+), #2308 (blocked)
- **Goal:** Every way of uploading (a résumé file, a photo of a résumé, merging into an existing résumé, recording, media) works on mobile, survives a reload and is recorded.
- **Owns:**
  - `api/src/services/resume/uploadIntake.ts` and the parse pipeline
  - `api/src/services/adapters/providers.ts` (the `resume_ocr` profile only)
  - `api/src/routes/upload.ts`
  - `api/src/services/storage/**`
  - a new `uploaded_assets` schema and repository (0512)
  - `frontend/lib/resume/*` intake helpers
  - `frontend/components/MediaPicker*`, `WebcamRecorder*`
  - `frontend/components/studio/v2/ActionsPanel.tsx` (recording handlers only)
  - the partner upload route
- **Contract:**
  - **One server-side text-extraction entry**, used by merge-into-résumé (#2228) and by ResumeRoast, SkillExtractor and the other résumé-adjacent tools (#2229). The client tries `extractTextFromFile` first and falls back to the server endpoint on failure or an empty result. Images take the vision OCR path.
  - **Restore a verified free vision fallback for `resume_ocr`.**
    - Check the model id against the gateway catalog using `model-catalog-audit.ts`; don't guess.
    - Convert HEIC in the browser before upload.
    - Record OCR cost in `ai_usage_records`. (#2233, #2230)
  - **Every R2 write goes through `putObject`**, which now also inserts an `uploaded_assets` row: key, owner, kind, bytes, content type and, where known, width/height and the source project. AI-generated images included. (#733)
    - `GET /api/upload/images` reads that table with cursor pagination, cached.
    - MediaPicker scrolls infinitely and shows per-asset metadata. (#950)
  - **Recordings and composed music upload through the same path** before they are put into a widget. A `blob:` URL never reaches saved state. (#563)
  - **WebcamRecorder:**
    - changing resolution keeps a screen-only capture as screen-only (#2237-webcam);
    - add image background upload, a custom colour picker and a blur-strength slider (#1787).
  - **Partner SDK `rawText` goes through the AI parse pipeline**, billed per D12. Until D12 is decided, keep the deterministic wrap and put a single switch in place. (#2270)
- **Acceptance:**
  - Tests: server extraction for PDF, DOCX and a photo; `putObject` records a row; pagination cursor; the recording-upload helper.
  - Screenshots or descriptions for 360 px and both themes.
  - *Unverified:* a real phone (HEIC from an iPhone).
- **Blocked parts:** #2308 (D13), #2356(a) (D9).

### WP-C — /build workspace (TK4/TK5)

- **Rows:** #2344, #374, #375, #990, #2220, #2254, #2258, #1342, plus the browser checks #2332 and #2329 (owner-assisted)
- **Goal:** The résumé + cover-letter workspace gives every analyzer finding a one-click fix, streams AI output, and supports review of any document.
- **Owns:**
  - `frontend/lib/build/**`, `frontend/components/build/**`
  - `api/src/services/resume/analyze.ts`
  - `frontend/lib/tools/**` (the wand registry)
  - `api/src/services/resume-feedback/**` and its schema (0513) and routes
  - `frontend/components/studio/document/section-importers.tsx`
  - `api/src/services/adapters/llm-client.ts` (streaming only)
- **Contract:**
  - **The analyzer returns structured actions.** Each recommendation carries `{category: enum, actionId?, args?}` validated by zod, so the frontend stops matching keywords. (#374)
  - **Add the missing wands:** consolidate similar entries, add a metric to a bullet, rewrite weak verbs, fill missing sections. Each is a registry entry, not a branch. (#375)
  - **`XyzReviewAllWizard`** steps through every entry's bullets and summary and applies changes as one undo group. (#990)
  - **Tool runs record the job label**, and the tailor response returns `matchedKeywords`. (#2344)
  - **Reviews:**
    - the review aggregate gets a polymorphic `subject_type` + `subject_id` (résumé, job, article), with résumé the only wired kind in this WP (#2254);
    - reviewers can attach a structured `suggestedEdit` and open a full proposed-draft editor with a diff (#2220).
  - **References** become a live link (`referenceContactId`) with a snapshot fallback. (#2258)
  - **Streaming:** a `streamLLM` path in `llm-client` (server-sent events, the same short-circuit rules as `isChainTerminal`). Wire it into the résumé scorer, optimizer and value-proposition first. Chat comes last. (#1342)
- **Acceptance:**
  - zod schema tests with real analyzer outputs.
  - A test for the wizard's undo grouping.
  - A migration test for review rows.
  - A streaming test that parses the event stream.
  - *Unverified* list for the owner: the full #2332/#2329 click paths.

### WP-I — Entry and intent (TK11/TK4)

- **Rows:** #2364, #2363, #922, #920, #2346-persuasion, #1658
- **Goal:** Every audience lands on a page made for them that ends in their upload step, and the studio opens on the right thing to create.
- **Owns:**
  - `frontend/pages/landing/**`
  - `frontend/components/studio/templates/audiences.ts`
  - `frontend/components/landing/**`
  - `frontend/scripts/` (sitemap generation)
  - `frontend/pages/Index.tsx`
  - a new `frontend/lib/studio/create-intent.ts`
  - `StudioLanding.tsx` (choosing the intent only)
- **Contract:**
  - **`AUDIENCES` is the one registry** for each audience's hero copy, proof, imagery and `createIntent` (resume | job | video | company). (#2364, #922)
  - **The sitemap is generated** from `AUDIENCES` + `TEMPLATE_CATALOG` at build time, and the hand-written entries are deleted. (#920)
  - **`resolveCreateIntent(user, preferences, landingSource)`** is a pure function that decides the default intent; StudioLanding shows it first and lets the user switch. (#2363)
  - **Fix the blank homepage for signed-in users**, finding the actual cause first. (#1658)
  - **The persuasion layer** gets a browser pass for both themes at 360 px (#2346-persuasion). It uses real counts only, never invented ones.
- **Acceptance:**
  - Unit tests for `resolveCreateIntent` and the sitemap generator.
  - Prerender still emits `/for/:audience` pages.
  - All copy is localized.

### WP-D1 — V1 cull (TK4)

- **Rows:** #693 → #721 → #752 → #639, #2311
- **Goal:** Delete the V1 studio. Every playback, preview and edit path runs on V2 `CanvasState` / Timeline JSON.
- **Owns:** `frontend/components/studio/**` (the V1 files and their callers), `frontend/pages/studio/StudioPreview.tsx`, `StudioPlayer*`, `NLETimeline*`, `VideoPreview.tsx`, `api/src/routes/studio*.ts` (the public payload only).
- **Contract (in order):**
  1. Move the NLE music and voiceover lanes onto Timeline JSON, with a read-time adapter for stored V1 scripts. (#693)
  2. `/api/studio/public/:videoId` returns V2 state, and `/v/:id` renders `CanvasStatePreview`. (#721)
  3. Delete StudioPlayer, StudioPreview, Storyboard, VideoScript and the other V1 surfaces, with each caller redirected. (#752)
  4. Work through the #639 deletion checklist.
  5. Remove the unreachable résumé branches in StudioEditorV2. (#2311)
- **Acceptance:**
  - A grep shows no V1 imports.
  - Old saved projects still play (fixture tests use a real V1 script JSON).
  - The bundle-size drop is reported.

### WP-E — Video fidelity: export matches preview (TK4)

- **Rows:** #742, #583, #570, #479, #476, #522, #1586, #1138, #669 (D10)
- **Goal:** What the user sees in the preview is exactly what gets exported and posted.
- **Owns:** `frontend/lib/renderer/**`, `frontend/lib/studio/editor-v2/export-facade.ts`, `PreviewOverlay.tsx`, `frame-renderer.ts`, the music scheduler hook, `frontend/lib/campaigns/bake-utm.ts`, the engagement widget playback components, and `package.json` (muxer dependencies only).
- **Contract:**
  - **The preview overlay renders through the same `frame-renderer` as the export**, transitions included. (#570, #742)
  - **Scene filters run as a `canvas-v2:filters` effect** shared by preview and export; the CSS-only path is deleted. (#583)
  - **Music:**
    - lane gain and fades are applied by one gain-envelope helper used by preview and export (#476);
    - a big seek rebuilds the schedule, driven by a seek event, not every animation frame (#479).
  - **Replace `mp4-muxer` and `webm-muxer` with `mediabunny`** behind the existing muxer interface. (#522)
  - **Engagement widgets are interactive during playback:** form submit, jumping to a chapter, thumbnail click-through, review popover. (#1586)
  - **Campaign UTMs** are added to CTA URLs during image, video and animation export. (#1138)
- **Acceptance:**
  - A pixel-diff test renders the same frame through preview and export with a filter and a transition.
  - Gain-envelope tests.
  - The mediabunny output plays in Chrome and Safari (owner check).
  - *Unverified:* the full export for each output profile.

### WP-G1 — Publish core (TK8/TK7)

- **Rows:** #2044, #2045, #2043 (umbrella), #887, #2237-share, #1968, #2138
- **Goal:** One publisher seam, platform presets, public pages that visitors can see, and a share menu on every card.
- **Owns:** `api/src/services/social/**`, the social publish routes, `shared/media-kinds.ts` (adding `PLATFORM_PRESETS`), `frontend/components/studio/v2/focus/**`, `ShareMenu*`, `ResumeDetail.tsx`, `PublicVideoResume.tsx`, the course/article/service detail pages (gate only), `api/src/routes/feed.ts` (link preview only), and `linkedinConnector`.
- **Contract:**
  - **Finish the `SocialAdapter` + `buildSocialPublisher(env)` seam** with YouTube running behind it unchanged, and `runSelfPublishGate` as the only Lane B gate. (#2044)
  - **`PLATFORM_PRESETS`:**
    - covers aspect, maximum duration and codec per platform;
    - per-platform variants are de-duplicated by content hash;
    - adds a lane chooser. (#2045)
  - **One `usePromoteWithoutAuth(entity)` gate** used by every public detail page. (#887)
  - **ShareMenu** takes title and text from each card, and the two copy-link-only pages use it. (#2237-share)
  - **The link preview fetches OpenGraph data** with a 1.5 s timeout and a byte cap, and caches by URL. (#1968)
  - **LinkedIn autofill** covers the Experience and Skills sections. (#2138)
- **Acceptance:**
  - Adapter contract tests with each platform's recorded responses.
  - Gate tests (free, Pro, guest).
  - Signed-out visitors see `/resumes/:slug` and `/v/:id` with no log-wall when promotion is on.
- **Blocked parts:** going live on each network (D4).

### WP-G2 — Scheduling, distribution and analytics (TK10/TK1)

- **Rows:** #2047, #2048, #2052, #2299, #2300 (D5)
- **Owns:** a new `social_publish_jobs` (0514) and `external_post_metrics` (0515) schema and repositories, `api/src/scheduled.ts` (a cron step only), a new `frontend/pages/studio/distribution/**`, and `ArtifactAnalyticsDashboard` (data source only).
- **Contract:**
  - **The queue is drained by the existing 5-minute cron**, at most 3 jobs per run (10 ms CPU, 50 subrequests). Jobs are idempotent, with bounded retries.
  - **The Distribution Hub** composes one post, sends it to several platforms and schedules it.
  - **Metrics** come from webhooks where a platform offers them, and otherwise from a batched cron sync. They are cached under a `social-metrics:{projectId}:{version}` key.
  - **#2300** is built only after D5. It reuses the queue.
- **Acceptance:** tests for the drainer's batch limit, retry and idempotency; webhook signature checks; the Hub at 360 px.

### WP-H — Paid promotion and measurement (TK7/TK10/TK1)

- **Rows:** #176, #1764 (D6), #1769, #1770, #976, #977, #978, #861, #1140
- **Owns:** `api/src/db/schema/advertising.ts` (0516), `api/src/services/advertising/**`, `api/src/services/paid-media/adapters/{google,bing,tiktok}/**`, `AdTargetingPanel.tsx`, `api/src/services/analytics/artifactAnalytics.ts`, `api/src/services/resume/view.ts`, and `MetricsPanel` (the résumé adapter only).
- **Contract:**
  - **Ads target any content** through `content_type` + `content_id`. Existing job and company ads are backfilled. (#176)
  - **Targeting:**
    - the evaluator filters in SQL, never in memory per user (#1769);
    - the inspector adds device, daypart and exclusions panels (#1770).
  - **Ad network adapters:**
    - the Google and Bing adapters translate a `TargetingSpec` into criterion mutates in one batch call (#976, #977);
    - the TikTok adapter uploads the video before creating the ad (#978).
  - **Analytics:**
    - résumé views store `ipCountry` from `cf.country`, and an aggregator endpoint feeds `MetricsPanel`, cached (#861);
    - `buildArtifactMetrics` reads `impression` events (#1140).
- **Acceptance:**
  - Adapter request-shape tests against each vendor's documented payloads.
  - The backfill migration is tested on a fixture.
- **Blocked parts:** live ad-account credentials (not needed to build), and D6.

### WP-D2 — One canvas, one renderer per widget (TK4)

- **Rows:** #2312, #1101, #1934, #1916, #2152, #2154, #2101, #2153
- **Owns:** `frontend/lib/studio/widgets/plugins/**`, `CanvasStage.tsx`, the `canvas-v2` renderer, `frontend/components/studio/document/**`, `DeclarativeResumeRenderer*`, and `resume-document-descriptor.ts`.
- **Contract:**
  - **Every widget kind is one plugin** with `emit` (DOM) and `paint` (Canvas2D), and nothing is left in a per-renderer switch. (#2312)
  - **`<TransformHandles/>`** is extracted as a shared primitive. (#1101)
  - **The canvas becomes the form:**
    - an inline-edit mode in `DeclarativeResumeRenderer` (#1916);
    - multi-column editing (#2101);
    - metaData and skillEvidence stay in the entity content (#2153).
  - **The document canvas is generalized:** articles get a block model (Tiptap ↔ blocks), and jobs get template database rows. (#2154, #2152)
  - **Finish the #1934 layout follow-ups.**
- **Acceptance:** every plugin passes one test that renders it both ways and compares; the inline-edit round-trip leaves entity content unchanged except for the edited field.

### WP-D3 — Every entity in the studio (TK3/TK6/TK4)

- **Rows:** #1915, #1955, #274, #275, #2221, #689
- **Owns:** the form pages being retired (see [docs/prd/studio-unified-authoring-migration.md](../prd/studio-unified-authoring-migration.md)), the entity input templates, `StudioLanding.tsx` (the create flow), and `template-content-slots.ts`.
- **Contract:**
  - **Each entity's edit form is removed**, its route redirects to `/studio` with the entity's input template, and the components left unused are deleted. (#1915, #1955)
  - **Company, profile and job pages get canvases.** (#274, #275)
  - **Creating something offers a template and a master/variant choice.** (#2221)
  - **Slot binders exist for all 12 templates.** (#689)
- **Acceptance:** every old route redirects (route tests); a grep shows no form components left; the create flow is shown at 360 px.

### WP-F — Video AI (TK4/TK3)

- **Rows:**
  - Free browser paths first: #136 (RNNoise WASM), #138 (MediaPipe reframe), #1997, #2145, #289, #290, #282, #283.
  - Then: #134, #137 (D11), #1237 + #2133 (D7), #2355 (D8).
- **Owns:** `WebcamRecorder` audio chain (after WP-B finishes), `frontend/lib/studio/nle/**`, the transcription job, the voice and pitch modules, and the sizzle template.
- **Contract:**
  - Browser-side models load lazily, only when the user opens the feature.
  - Server calls go through the gateway with Pro gating.
  - Transcription gets a retry button and a bounded automatic retry. (#2145)
  - NLE M2/M3 reuse the effect-renderer registry from WP-E.
- **Acceptance:** each feature can be switched off; WASM loads only on demand (checked in the bundle report).

---

## 7. Audit and verification protocol

### 7.1 Implementer report (required format)

```
WP: <id>    Rows: #… #…
Files changed: <list, with new / deleted marked>
Migrations: <number, file, what it does>
Coordinator snippets: <exact app.ts / hot-routes / schema index / apiDeps additions>
New i18n keys: <namespace.*> (en/es/fr-CA)
Tests added: <file → cases>
Per-row status: #… done | partial (what remains) | blocked (single blocker)
Unverified: <anything that needs a browser / live Worker / real device>
Deleted code: <what, with proof of zero references>
Risks / follow-ups: <new gaps found, with a proposed row>
```

### 7.2 Coordinator review checklist (Opus, on every diff)

1. **Scope:** every row claimed done meets its contract above; nothing is half-wired; no unrelated deletions.
2. **Workers Free:** no heavy top-level init in API modules; any new hot route is added to `hot-routes.ts`; cron batches are bounded; no new heavy dependency.
3. **Architecture:** no route imports a table or vendor client; no file over ~400 lines; no new god service; duplicated logic is extracted and every copy migrated.
4. **Data:**
   - the migration number matches §3.2 and the file is new;
   - indexes are declared in the schema;
   - 3NF holds;
   - `run-sql-migrations` lint passes.
5. **Caching:** new read endpoints are cached and invalidated on write.
6. **Frontend:** strings are in all three locales with real translations; colours are tokens only; layout holds at 360 px; new pages follow the page checklist.
7. **Tests:** real fixtures; happy path, boundary and error cases; no `setTimeout` flushing.
8. **Paid AI:** Pro-gated and recorded in `ai_usage_records`.

Any failure goes back to the same implementer (via SendMessage) with the specific items. The WP is not accepted until it is fixed.

### 7.3 Verifier brief (Sonnet, after every review pass)

```
Run, from hired.video/, and report each command's exit code + the failing output only:
  cd api && npm run typecheck
  cd api && npm test                       # or the targeted files listed in the report
  cd api && node scripts/lint-migrations.mjs   # if a migration was added
  node scripts/check-gap-ids.mjs
  cd api && npx wrangler deploy --dry-run --outdir /tmp/dry   # report bundle KiB
  cd api && npx wrangler check startup     # report startup CPU ms (must stay < 1000 on CI)
  cd frontend && npm run typecheck
  cd frontend && npx vitest run <files from the report>
  cd frontend && npm run lint
Do not fix anything. Do not review design.
```

The coordinator confirms the exact lint and startup flags before the first run.

### 7.4 Closing rows

- The coordinator moves a row to DONE.md only when the review passes, the verifier is green, and the row has nothing under *Unverified* (or the owner has confirmed those items).
- A row that is done in code but waiting on a browser or live check stays in ROADMAP.md as ◐ Partial, with the one remaining check written in the row.
- New gaps found during a WP get the next free ID and are added to the right TK section (or OTHER/Deferred) in the same pass.
- The coordinator updates the register totals and the loop-stage summary table after each wave.

---

## 8. OTHER / Deferred (493 rows) — Wave 5 triage rules

These rows are not scheduled. At the end of Wave 4 (or sooner if the owner asks), the coordinator goes through each track section under OTHER / Deferred:

1. **Promote** a row into a WP if Waves 1–4 made it part of the loop. Example: recruiter-side views of a promoted résumé.
2. **Fold** a row into a WP when that WP already touches the same files and fixing it costs less than ~10% more. Example: perf or N+1 rows in a module being rewritten. The implementer gets the row ID in the brief.
3. **Close as Won't-fix** rows the 2026-10-03 job-seeker-only direction made obsolete (recruiting marketplace, CHRO, LMS), but only with the owner's approval and in batches.
4. **Keep** everything else as is, with no work.

Security and compliance rows in OTHER (CISO and General Counsel items in the Go-Live section) are reviewed once at the start of Wave 3, because public pages and paid promotion widen the attack surface.
