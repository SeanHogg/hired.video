# PRD — Social Media Publishing & Distribution (Studio → TikTok / YouTube / Instagram / …)

**Owner:** hired.video Studio + Growth. This is **native hired.video work** — it is the distribution arm of the Studio and a core network-effect moat (see §0).
**Status:** Spec — partial reference implementation exists (YouTube publish + OAuth + `studio_project_publications` + `PUBLISH_DESTINATIONS` registry). This PRD generalizes that into a full multi-platform, two-lane, scheduled, campaign-aware distribution system.
**Surfaces:**
- **Studio "Share / Publish" menu** — the existing per-project publish dropdown (`publishDestinationsFor(kind)` in [shared/media-kinds.ts](../../shared/media-kinds.ts)), extended with social destinations + the two-lane chooser.
- **Distribution Hub** (`/studio/distribution` or a Studio tab) — schedule, multi-destination batch, per-platform metadata variants, publish history, ingested analytics.
- **Connections settings** (`/settings/connections`) — OAuth-connect the user's own TikTok / YouTube / Instagram / X / Facebook / LinkedIn accounts.
- **External API + webhooks** — `/api/social/*` publish + status callbacks; platform webhooks for delivery/analytics.

This document is referenced by the **Social Media Publishing & Distribution** Consolidated Gap Register entries (#2036–#2050, see [README](../../ROADMAP.md#consolidated-gap-register)).

---

## 0. Strategic framing

hired.video's thesis is *"promote yourself, get hired."* Distribution is the promotion. A resume video, creator clip, or page→video that never leaves hired.video promotes nothing. Social publishing is therefore **native to the moat** — hired.video owns and builds it, like every other capability on the platform.

Two compounding network effects justify owning this:

1. **Creator reach** — individuals get a one-click pipe from Studio to every platform they care about. This is the "Generate & Get Paid" flywheel's distribution half (see [README Creator Monetization Roadmap](../../README.md)).
2. **Platform reach (the differentiator)** — hired.video runs **its own brand accounts** on each platform and lets users publish *through* them for free. Every piece of free-lane content is hired.video-branded reach the company would otherwise pay for, and a funnel back to creator profiles. This is the distribution moat called out in [README Strategic Moats](../../README.md#strategic-moats) ("Lean into distribution… shareable links").

**The two lanes (the core mechanic):**

| Lane | Who pays | Account used | Gate |
|------|----------|--------------|------|
| **A — Publish via hired.video** | Free for everyone | hired.video's *managed* brand account on the platform | Moderation/curation only (our reputation is on the line) |
| **B — Publish to your own account** | **Pro-gated** ($9.95/mo, [project_pricing_seats]) | the user's *own* OAuth-connected account | Pro entitlement → connection check → publish |

Lane B's gate sequence is the heart of this PRD: a non-paying user who clicks "Publish to my TikTok" hits the **paywall first** (convert to Pro), then a **connection check** (OAuth-connect TikTok if not connected), then publishes. A free user always has Lane A as the no-cost escape hatch, which is also what drives hired.video's owned reach.

PII/secrets concentration: OAuth tokens for users' personal social accounts are sensitive. They live encrypted in hired.video (the system of record for identity/social already, [README](../../README.md)), reusing the existing `oauthAccounts` storage pattern ([api/src/routes/oauth.ts](../../api/src/routes/oauth.ts)).

---

## 1. Background & problem

Studio can render to many formats — H.264/H.265 MP4, vertical 9:16, square 1:1, GIF/WebP, podcast MP3/M4A — and the output profile + publish-destination registries already exist in [shared/media-kinds.ts](../../shared/media-kinds.ts). The render→storage path is production-solid: rendered output lands in R2 (`videos.r2Key`, `studio_projects.*State`), and `studio_project_publications` ([api/src/db/schema/studioPublications.ts](../../api/src/db/schema/studioPublications.ts), migration `0196`) already records *"where has this project been published."*

But distribution is **a stub**:

- **Only YouTube actually publishes.** [api/src/services/youtube/publishVideoUseCase.ts](../../api/src/services/youtube/publishVideoUseCase.ts) + [api/src/routes/youtube.ts](../../api/src/routes/youtube.ts) do a full OAuth + Data-v3 multipart upload, Pro-gated via `requirePro("YouTube Publishing")` ([api/src/middleware/auth-gates.ts](../../api/src/middleware/auth-gates.ts)). **LinkedIn is scaffolded** ([frontend/components/studio/LinkedInPublisher.tsx](../../frontend/components/studio/LinkedInPublisher.tsx), copy-gen in [api/src/routes/studio-features.ts](../../api/src/routes/studio-features.ts)) but not a real post. **TikTok, Instagram Reels, YouTube Shorts, X, Facebook are registered as labels nowhere** — they are not even in `PublishDestinationId`.
- **There is no "publish via hired.video" lane at all.** Every existing destination assumes the *user's* account. The free, managed-account lane that powers owned reach does not exist.
- **No scheduling.** Publish is synchronous and immediate; the only cron consumer today is the email campaign queue ([api/src/scheduled.ts](../../api/src/scheduled.ts)).
- **No per-platform metadata/aspect variants.** A 16:9 YouTube cut and a 9:16 TikTok cut of the same project have no first-class representation; the aspect system ([frontend/lib/studio/aspect.ts](../../frontend/lib/studio/aspect.ts)) supports 9:16/1:1/16:9 but nothing maps a platform → required aspect.
- **No analytics ingestion.** `artifact_views` ([api/src/services/analytics/artifactAnalytics.ts](../../api/src/services/analytics/artifactAnalytics.ts)) tracks on-platform views only; external likes/views/shares from TikTok/YT never flow back.
- **No campaign concept for organic social.** The campaign engine ([shared/campaigns.ts](../../shared/campaigns.ts), `email_campaigns`) is **email-only**. The paid-media adapters ([api/src/services/paid-media/adapters/{meta,google,tiktok,linkedin,bing}](../../api/src/services/paid-media/)) are **ad-buying**, not organic posting — different APIs, different scopes, but a reusable OAuth/adapter shape.

So the "share your video everywhere" promise is, today, "upload to YouTube if you're Pro." This PRD closes that.

---

## 2. Goals & non-goals

### Goals
- **One publish abstraction, N platforms.** A single `SocialPublisher` DI seam (mirroring `LLMClient`/`match-handlers.ts`, [project_api_stack_and_hono_routing]) with one adapter per platform (TikTok, YouTube long + Shorts, Instagram Reels/Feed, X, Facebook Page, LinkedIn). Adding a platform = one adapter + one `PublishDestinationId` entry; the menu self-renders (no `canPublishToX` prop-drilling, [feedback_extract_on_duplication]).
- **Two lanes, one chooser.** Every social destination offers Lane A (via hired.video, free) and Lane B (your own account, Pro). The lane chooser is a shared component that self-gates.
- **The Lane B gate sequence:** entitlement (Pro) → connection (OAuth) → token freshness → publish, surfaced as a single linear flow with the upgrade prompt and connect prompt inline.
- **Per-platform asset + metadata variants.** A project produces platform-targeted renders (aspect/duration/codec from a platform preset) + per-platform caption/hashtags/title, derived once and cached.
- **Scheduling + batch.** Schedule a post for a future time; publish to multiple destinations in one action; a cron worker drains the queue (reusing the `scheduled.ts` cadence).
- **Analytics round-trip.** Pull external views/likes/shares back into the existing `artifact_views`/`ArtifactAnalyticsDashboard` surface, plus a per-publication external-metrics row, via platform APIs/webhooks — cached, never polled per request.
- **Native cross-post.** Publishing optionally also creates a `feed_posts` row ([api/src/db/schema/feed.ts](../../api/src/db/schema/feed.ts)) so the content lives on hired.video's own social feed too.
- **Managed-account governance.** Lane A content passes an AI moderation classifier (reuse Claude API, [project_llm_gateway_models]) + optional SuperAdmin approval queue before it posts under hired.video's brand.
- All reads cached through `getOrSetCached` ([api/src/utils/edge-cache.ts](../../api/src/utils/edge-cache.ts)); all writes through `canActFor()` ([api/src/services/studio/workspace.ts](../../api/src/services/studio/workspace.ts)).

### Non-goals
- **Ad buying / paid promotion.** That is the existing `paid-media` domain (Meta/Google/TikTok/LinkedIn/Bing ad APIs). This PRD is **organic posting only**. The two share OAuth ergonomics but not scope or surface.
- **A social inbox / DM management / comment moderation across platforms.** Out of scope (candidate for a later "Social Engagement" PRD — logged as a gap).
- **Re-implementing render.** We consume the existing Studio render pipeline ([frontend/lib/studio/editor-v2/export-facade.ts](../../frontend/lib/studio/editor-v2/export-facade.ts)); we only add platform *presets* that pick aspect/codec/duration.
- **Storing platform content long-term on the user's behalf.** We store the R2 master + publication records + ingested metric snapshots, not a mirror of each platform's copy.
- **Guaranteeing platform API parity.** Some platforms (Instagram in particular) restrict programmatic publishing to Business/Creator accounts and/or require app review; where a platform forbids direct publish we fall back to a "download + guided manual upload" flow (same shape as the existing `webtoon-feed`/`tapas-feed` "manual upload" destinations).

---

## 3. Users & access

| Role | Can do |
|------|--------|
| **Free user (job seeker / creator)** | Lane A only: submit a rendered project to publish **via hired.video's managed account** (subject to moderation). Cross-post to own hired.video feed. Cannot publish to own external accounts (hits paywall). |
| **Pro user ($9.95/mo)** | Lane A **and** Lane B: connect own TikTok/YouTube/IG/X/FB/LinkedIn, publish to them, schedule, batch, see ingested analytics. |
| **Company / workspace member** | Publish company-owned projects to the **company's** connected accounts (Lane B, company-scoped), gated by `canActFor(actor, ownerUserId, ownerCompanyId)` + company plan. Lane A posts attribute the company. |
| **Delegated creator / agency** | Acts for a subject via `studio_grants` (`scope='studio'`) — same `canActFor()` path. Can publish on the subject's behalf if the grant covers it. |
| **SuperAdmin** | Manage hired.video's **managed brand accounts** (connect/refresh the platform tokens behind Lane A), run the Lane A moderation/approval queue, set platform presets + rate limits, view global distribution analytics. |
| **Public (no auth)** | Nothing here. (Published content is public *on the destination platform*, not via this API.) |

**Gating rule (Lane B), enforced server-side, never trusting the client:**
1. `canActFor()` passes for the project's owner/company → else 403.
2. Pro/seat entitlement present → else **402 `PRO_REQUIRED`** with `upgradeUrl` (the existing `requirePro` envelope).
3. A connected, non-expired account for that platform exists → else **409 `ACCOUNT_NOT_CONNECTED`** with the connect URL.
4. Publish.

Lane A skips steps 2–3 but **adds** a moderation gate before the managed account posts.

---

## 4. Surfaces

### 4.1 Studio "Share / Publish" menu (extended)
The existing per-project publish dropdown already renders `publishDestinationsFor(kind)`. We:
- Add social `PublishDestinationId`s: `tiktok`, `youtube-shorts`, `instagram-reels`, `instagram-feed`, `x-post`, `facebook-page` (YouTube long + `linkedin` already exist).
- Each social row expands into a **lane chooser** (shared `<PublishLaneChooser>` component): "Post via hired.video (free)" vs "Post to my @handle (Pro)". The chooser self-gates — it computes lane availability from a single `useSocialPublishEntitlement(platform)` hook (returns `{ laneA: true, laneB: 'available' | 'needs_pro' | 'needs_connection' }`), so no booleans are prop-drilled ([feedback_extract_on_duplication], DRY hook rule).
- `requiresRender: true` for all social destinations (must have a baked output first), reusing the existing flag on `PublishDestination`.

### 4.2 Distribution Hub (`/studio/distribution`, a Studio tab — wrapped in `<AppShell>`, `useSEO`, `useBreadcrumbs` per [feedback_new_page_checklist])
- **Compose**: pick project → pick destinations (multi-select) → per-destination metadata variant editor (caption, hashtags, title, thumbnail, aspect preset) → schedule-now or schedule-for → publish.
- **Calendar / queue**: scheduled + in-flight + published posts, grouped by date.
- **History**: per-publication status (published/failed/pending/awaiting-moderation), external URL, retry.
- **Analytics**: ingested external metrics per publication (views/likes/shares/comments) folded into the existing `ArtifactAnalyticsDashboard` shell.

### 4.3 Connections settings (`/settings/connections`)
- One row per supported platform: Connected (handle + avatar + token expiry) / Connect (OAuth start) / Disconnect.
- Reuses the OAuth start/callback/disconnect shape in [api/src/routes/oauth.ts](../../api/src/routes/oauth.ts) and the `youtube_accounts` precedent — generalized to a `social_connections` table (§6) keyed by `(ownerUserId|companyId, platform)`.

### 4.4 SuperAdmin — Managed Accounts (`/admin/social-accounts`)
- Powers Lane A (§5.0 layer 2). One row per platform: **Connect / Re-auth / Disconnect** hired.video's corporate brand account (the OAuth flow runs under the SA, token persists to `managed_accounts`).
- Shows, per platform: brand-account handle + token health/expiry + granted scopes; **and** the developer-app status read-only from config (`client_id` present? required scopes? app-review state) so the SA can see *why* a platform's free lane is or isn't live.
- Lane A moderation/approval queue (§5.3) + per-platform auto-publish-vs-review toggle live here too.
- SuperAdmin-gated routes (the user routes with `?lane=managed`): `GET /api/social/:platform/auth-url?lane=managed`, `POST /api/social/:platform/disconnect?lane=managed`, `GET /api/social/platforms?lane=managed` (status board). OAuth returns to the one callback handler (provider-registered alias `/api/admin/social/oauth/callback`).

### 4.5 External API — `/api/social/*`
- `GET  /api/social/platforms` — supported platforms + per-user lane availability **+ `managedLaneReady` per platform** (whether layers 1+2 of §5.0 are satisfied so Lane A is live). Cached per user, invalidated on connect/disconnect/plan change/managed-account change.
- `GET  /api/social/connections` — the caller's connected accounts.
- `GET  /api/social/:platform/auth-url` — OAuth start (HMAC state, mirrors `oauth.ts`).
- `POST /api/social/:platform/callback` — OAuth exchange + upsert `social_connections`.
- `POST /api/social/:platform/disconnect`.
- `POST /api/social/publish` — body `{ projectId, destinations: [{ platform, lane: 'managed'|'self', variantId, scheduledAt? }] }`. Runs the §3 gate per destination, enqueues or publishes. **Pro-gated per `lane:'self'` destination** via the generalized `requirePro` path.
- `GET  /api/social/publications?projectId=` — publication + ingested-metric rollup (read-through cached, keyed `social-pub:{projectId}:{version}`, invalidated on publish/metric-sync).
- `POST /api/social/variants` — derive/persist per-platform asset+caption variants for a project.
- **Webhooks (inbound)**: `/api/social/webhooks/:platform` — delivery confirmations + metric updates → invalidate the relevant cache keys, fire notifications. (Where a platform has no webhook, a cron metric-sync job pulls instead.)

---

## 5. Functional requirements

### 5.0 Connection layers (the prerequisite the free lane depends on)

There are **three** distinct "connections," at three different levels, and conflating them is a design trap. The free lane (Lane A) cannot work until layers 1 **and** 2 exist, in that order.

| Layer | What it is | Stored where | Owner / cadence |
|------|------------|--------------|-----------------|
| **1. Platform developer app** (OAuth client) | hired.video's registered app on each platform → `client_id` + `client_secret` (+ redirect URIs, requested scopes, app-review status). **Prerequisite for BOTH lanes.** | **Cloudflare Worker Secrets** (`wrangler secret put TIKTOK_CLIENT_ID` …), read at runtime via `getEnv()`. Same mechanism as the existing `LINKEDIN_CLIENT_ID`/`GOOGLE_CLIENT_ID` (shared by Google sign-in and YouTube)/`GOOGLE_CLIENT_SECRET` in [api/wrangler.toml](../../api/wrangler.toml) + [api/src/routes/oauth.ts](../../api/src/routes/oauth.ts). | Dev/ops, **one-time per platform**. App config — immutable between deploys. |
| **2. hired.video brand account** (powers Lane A) | A SuperAdmin OAuth-connects hired.video's own corporate account (`@hired.video`, the LinkedIn Company Page, the YouTube brand channel, etc.) **once per platform** → an access/refresh **token** for that brand account. | **Database** — `managed_accounts`, tokens **encrypted at rest** (NOT Secrets: these rotate via refresh-token rotation and are mutable runtime data; Secrets are deploy-time config). | **SuperAdmin**, one-time per platform, via the SA "Managed Accounts" surface (§4 below). |
| **3. End-user account** (powers Lane B) | Each Pro user OAuth-connects their **own** account. | **Database** — `social_connections`, tokens encrypted (the `oauthAccounts`/`youtube_accounts` precedent). | Each Pro user, self-serve at `/settings/connections`. |

**The secret-vs-DB rule (explicit):** *client credentials* (one `client_id`/`client_secret` pair per platform, app-level config) live in **Secrets**; *account tokens* (brand **or** user, mutable, refreshed) live in **encrypted DB rows**. This is exactly the split the codebase already uses — `LINKEDIN_CLIENT_SECRET` is a secret; the per-user LinkedIn token lands in `oauthAccounts`.

**Bring-up order for a platform's free lane:** (a) register the developer app + complete any app review → put `client_id`/`client_secret` in Secrets; (b) SuperAdmin connects hired.video's brand account via OAuth → token persisted in `managed_accounts`; (c) the free lane is now live for all users. Until (b), the Studio "Post via hired.video" option for that platform is **disabled with an "not yet available" state** (driven by a `GET /api/social/platforms` field — `managedLaneReady: boolean` — never a hardcoded flag).

**SuperAdmin "Managed Accounts" surface** (new SA tab, §4.4 below also lists it): connect / re-auth / disconnect each platform's brand account; shows token health + expiry + which scopes were granted; surfaces the developer-app status (registered? scopes approved? app-review pending?) read-only from config so the SA knows *why* a platform isn't live. This is the SA-managed connection ritual the prior draft omitted.

**Platform app-review / scope caveats (rollout-affecting):**
- **TikTok** — Content Posting API requires app review; un-reviewed apps can only post to the developer's own sandbox accounts.
- **Instagram** — Content Publishing API requires a **Business/Creator** account linked to a Facebook Page + Meta app review; personal IG accounts cannot be published to programmatically (→ manual-upload fallback, `directPublish:false`).
- **X (Twitter)** — posting requires a paid API tier; budget + tier selection is an ops prerequisite.
- **LinkedIn — Lane A ≠ Lane B scope.** "Share on LinkedIn" (`w_member_social`) posts to a *member's* feed (Lane B). Posting to hired.video's **Company Page** (Lane A) needs the **Community Management API** (`w_organization_social`), which is a **separate product** on the dev app, requires app review, and requires an organization admin to authorize the app against the Page. The adapter therefore carries lane-specific scope requirements, and the SA brand-account connect for LinkedIn must request the org scope, not the member scope.

### 5.1 The `SocialPublisher` DI seam + adapters
One interface, one adapter per platform, resolved through a single factory (the `match-handlers.ts`/`LLMClient` pattern, [project_scraping_domain]/[project_llm_gateway_models]):
One interface, one adapter per platform, resolved through a single factory (the `match-handlers.ts`/`LLMClient` pattern, [project_scraping_domain]/[project_llm_gateway_models]):

```
interface SocialAdapter {
  platform: SocialPlatform;
  requiredAspect(kind): AspectRatio[];        // e.g. tiktok → ['9:16']
  maxDurationSec(kind): number | null;        // shorts/reels caps
  // Lane B (user's own account)
  publishToAccount(conn: SocialConnection, asset: BakedAsset, meta: PostMeta): Promise<PublishResult>;
  // Lane A (hired.video managed account)
  publishToManaged(managed: ManagedAccount, asset, meta, attribution): Promise<PublishResult>;
  fetchMetrics(ref: ExternalPostRef): Promise<ExternalMetrics>;
  capabilities: { directPublish: boolean; webhook: boolean }; // false → manual-upload fallback
}
```

- Adapters that cannot directly publish (`directPublish:false`, e.g. IG personal accounts pre-app-review) return a `ManualUploadResult` and the UI renders the download + step-by-step guide (same UX contract as the existing `webtoon-feed`/`tapas-feed` manual destinations).
- Adapters live in `api/src/services/social/adapters/<platform>/`. The factory `buildSocialPublisher(env)` is the only place that knows the adapter set — routes never name a platform's API.

### 5.2 Lane B — publish to the user's own account (the gated flow)
Server-side, in order, returning a typed error envelope on each stop (so the client renders the right inline prompt):
1. **Authorization** — `canActFor(actor, project.userId, project.companyId, deps)`; else `403 FORBIDDEN`.
2. **Entitlement** — generalized `requireSocialSelfPublish` (the `requirePro` shape): paid plan present? else `402 PRO_REQUIRED` + `upgradeUrl`. The frontend `useSocialPublishEntitlement` already surfaced `laneB:'needs_pro'` so the chooser shows "Upgrade to post to your own account" *before* the click — but the **server re-checks** (never trust the embed/UI).
3. **Connection** — a fresh `social_connections` row for `(owner, platform)`? else `409 ACCOUNT_NOT_CONNECTED` + `connectUrl`. Token expired → attempt refresh (refresh-token rotation, the pattern just added for calendar in gap #1992); unrecoverable → treat as not-connected.
4. **Publish** — pick the platform variant asset (§5.4), call `adapter.publishToAccount`, upsert `studio_project_publications` (extend its `destination` keyspace) + a `social_publications` detail row, fire `social.published` webhook + a `notifications` row ([api/src/services/notifications/notification-service.ts](../../api/src/services/notifications/notification-service.ts)).

This generalizes the proven YouTube path (`publishVideoUseCase.ts`, already `requirePro` + connection-checked) to every platform; YouTube's existing route becomes one adapter behind the seam (no behavior change, dead bespoke code removed — [README dead-code rule]).

### 5.3 Lane A — publish via hired.video's managed account (free)
**Prerequisite (per §5.0):** the platform's developer app is registered (`client_id`/`client_secret` in Secrets) **and** a SuperAdmin has connected hired.video's brand account (`managed_accounts` row present, token healthy). `GET /api/social/platforms` exposes `managedLaneReady` per platform; the "Post via hired.video" option is disabled (with an explanatory state) until both are true. The per-request flow:
1. **Authorization** — `canActFor()` for ownership/attribution (we attribute the creator).
2. **Moderation gate** — AI classifier (Claude via the LLM gateway, the same screen the Article Partner Program uses, [README]) scores the asset's caption + a frame/thumbnail + transcript for policy violations. Pass → optionally a SuperAdmin approval queue (configurable per platform: auto-publish vs review). Fail → rejected with reason, surfaced to the user.
3. **Publish** under hired.video's managed account for that platform (`managed_accounts` table, SA-managed tokens), with non-removable attribution ("by @creator · made on hired.video") + a link back to the creator's hired.video profile, and a watermark on the asset variant (the watermark the Free tier already applies, per gap #1990).
4. Record as a `studio_project_publications` row with `lane='managed'`; metrics from the managed account roll up into a **platform-reach** analytics view (SA) and a creator-facing "your reach via hired.video" stat.

Lane A is the free escape hatch *and* the owned-reach engine: every free user who can't/won't pay still produces hired.video-branded distribution.

### 5.4 Platform presets + per-platform variants
- A `PLATFORM_PRESETS` registry (sibling to `OUTPUT_PROFILES`/`PUBLISH_DESTINATIONS` in [shared/media-kinds.ts](../../shared/media-kinds.ts)) maps platform → `{ aspect, maxDurationSec, codecProfileId, safeAreas }` (e.g. `tiktok → 9:16, 600s, h264-mp4`; `youtube-shorts → 9:16, 60s`; `x-post → 16:9|1:1, 140s`). This is the missing "platform → required aspect" map called out in §1.
- On compose, a project yields a **variant** per chosen platform: the Studio render is re-baked (or reused if the existing baked output already matches the preset) at the preset's aspect/duration/codec. Variants are content-hashed (reuse `nle_media_sources.contentHash` dedup) so the same 9:16 cut feeds TikTok + Reels + Shorts without re-rendering.
- Per-platform **metadata variant**: caption/title/hashtags. AI-assisted copy reuses the LinkedIn copy-gen already in [api/src/routes/studio-features.ts](../../api/src/routes/studio-features.ts), generalized to per-platform tone/length/hashtag limits.

### 5.5 Scheduling + batch
- `social_publish_jobs` queue (status `scheduled|claimed|publishing|published|failed|awaiting_moderation`, `scheduledAt`, `attempts`, `lane`, idempotency key). One job per (project, destination, variant).
- The existing 5-minute cron ([api/src/scheduled.ts](../../api/src/scheduled.ts)) gains a drainer that claims due jobs (`scheduled && scheduledAt <= now`), runs the §5.2/§5.3 flow, and is **idempotent + retry-bounded** (the L2 action-engine separation pattern from [project_inbox_processors]). No new cron trigger — same cadence as campaigns.
- Batch publish = one `POST /api/social/publish` with N destinations → N jobs (immediate jobs run inline up to a small fan-out cap; the rest queue).

### 5.6 Analytics ingestion (round-trip)
- Per publication, an `external_post_metrics` snapshot row `(publicationId, views, likes, shares, comments, fetchedAt)`. Updated by (a) inbound platform webhooks where available, (b) a cron metric-sync for the rest, batched (never N+1 per publication — `GET ?ids=` style batch where the platform allows).
- Folded into the existing `ArtifactAnalyticsDashboard` as an "off-platform reach" panel and summed into the project's headline metrics. Reads are `getOrSetCached`, keyed `social-metrics:{projectId}:{version}`, version bumped on each sync write.

### 5.7 Native feed cross-post
- A `crossPostToFeed: true` option on publish creates a `feed_posts` row ([api/src/db/schema/feed.ts](../../api/src/db/schema/feed.ts)) with `kind='video'`, `subjectType/subjectId` → the studio project, and the same caption — so the content also lands on hired.video's own social feed (reshare/analytics already wired, [project_social_feed]). No duplicate renderer; reuses the feed embed payload.

### 5.8 Caching, DRY, auth (cross-cutting, non-negotiable)
- **Reads**: platform list, connections, publications, metrics all flow through `getOrSetCached` (L1 Map + L2 KV), invalidated on connect/disconnect/publish/metric-sync. A new read endpoint that isn't cached states why ([README caching rule]).
- **DRY**: lane availability, gate state, and platform capability are each computed in exactly one place (`useSocialPublishEntitlement`, `runSelfPublishGate`, `adapter.capabilities`) and consumed — no parallel re-derivation.
- **Auth on both checks**: UI gate is UX only; the server gate (§5.2) is authoritative.

---

## 6. Data model & migrations

New tables (Drizzle + numbered SQL migration starting `0214_social_publishing.sql`, idempotent per [feedback_fix_root_cause_not_workaround] + `TEMPLATE.md`):

- **`social_connections`** — `(id, ownerUserId, ownerCompanyId nullable, platform, externalAccountId, handle, displayName, avatarUrl, accessToken [encrypted], refreshToken [encrypted], tokenExpiresAt, scopes[], status, createdAt, updatedAt)`. Unique `(coalesce(ownerCompanyId,ownerUserId), platform)`. Generalizes `youtube_accounts`; the OAuth `oauthAccounts` storage pattern is the encryption precedent.
- **`managed_accounts`** — hired.video's own per-platform brand accounts powering Lane A (SA-managed access/refresh **tokens**, same column shape as `social_connections`, `isManaged=true`). Platform-global, not tenant-scoped. **Holds tokens only** — the platform `client_id`/`client_secret` are NOT here; they are Worker Secrets (§5.0). One row per platform once a SuperAdmin connects the brand account.
- **`social_publications`** — detail row extending `studio_project_publications`: `(id, projectId, destination, platform, lane 'managed'|'self', connectionId nullable, variantId, externalPostId, externalUrl, status, moderationStatus, publishedAt)`. (`studio_project_publications` stays the SSoT "where published"; this carries social-specific columns.)
- **`social_post_variants`** — `(id, projectId, platform, assetContentHash, assetR2Key, aspect, durationSec, caption, title, hashtags[], thumbnailR2Key)`.
- **`social_publish_jobs`** — the scheduler queue (§5.5).
- **`external_post_metrics`** — `(id, publicationId, views, likes, shares, comments, fetchedAt)` (latest-snapshot upsert, not append).

Plus: extend `PublishDestinationId` + `PUBLISH_DESTINATIONS` ([shared/media-kinds.ts](../../shared/media-kinds.ts)) with the social ids, and add `PLATFORM_PRESETS` (§5.4). ALTER the `studio_project_publications` destination CHECK constraint to admit the new ids (idempotent ALTER per #1625).

**Secrets (not DB), one pair per platform** — wired the same way as the existing entries in [api/wrangler.toml](../../api/wrangler.toml): `TIKTOK_CLIENT_ID`/`TIKTOK_CLIENT_SECRET`, `META_APP_ID`/`META_APP_SECRET` (IG + FB), `X_CLIENT_ID`/`X_CLIENT_SECRET`, plus the already-present `YOUTUBE_*` and `LINKEDIN_*`. LinkedIn needs both the member scope (Lane B) and the org/Community-Management scope (Lane A) granted on the one dev app (§5.0).

---

## 7. Data ownership, compliance & platform ToS

- **System of record**: hired.video for the R2 master, publication records, variants, and metric snapshots. The platform owns the live post.
- **User OAuth tokens** are PII-adjacent secrets — encrypted at rest, never shipped to the browser, minted/refreshed server-side only (the embed-token discipline from [embeddable-hr-suite.md §5]). Disconnect revokes + nulls tokens.
- **Platform ToS / scopes**: each adapter uses the minimum publishing scope; Instagram/TikTok app-review and Business/Creator-account constraints are tracked per adapter — where direct publish is disallowed we use the manual-upload fallback rather than violating ToS. Rate limits per platform are honored in the cron drainer.
- **Lane A liability**: because content posts under hired.video's brand, the moderation gate (§5.3) is mandatory and SA-auditable. Attribution + watermark are non-removable.
- **DSR / erasure**: disconnect + account deletion revoke tokens and drop `social_connections`; published external posts can't be force-deleted by us, but we stop syncing + drop local metric snapshots and surface a "remove from your platform" guide. Reuses the platform DSR posture from [international-expansion-and-data-residency.md](international-expansion-and-data-residency.md).
- **Region**: token storage + metric snapshots region-pin per the data-residency architecture.

---

## 8. Phasing (maps to Consolidated Gap Register #2043–#2050)

- **Phase 1 — Seam + YouTube refactor + Lane B gate (Now):** `SocialPublisher` seam + adapter interface; refactor the existing YouTube publish behind it (no behavior change, drop bespoke route code); generalize `requirePro` → `runSelfPublishGate` (entitlement → connection → publish); `social_connections` table + `/settings/connections` for YouTube. Includes the **per-platform Secrets convention** (§5.0 layer 1 — `*_CLIENT_ID`/`*_CLIENT_SECRET` wiring + the `getEnv()` lookup, mirroring the existing `YOUTUBE_*`/`LINKEDIN_*` entries) so adding a platform is a documented secret + adapter, never code-spelunking. Proves the gate end-to-end on the one platform that already works.
- **Phase 2 — TikTok + Shorts + Reels (Lane B) + presets + variants (Soon):** TikTok, YouTube Shorts, Instagram Reels adapters; `PLATFORM_PRESETS` + per-platform variant baking (9:16) + AI caption/hashtag gen; the lane chooser UI + `useSocialPublishEntitlement`. Per-platform developer-app registration + app review is an ops prerequisite tracked alongside (§5.0 caveats).
- **Phase 3 — Lane A managed accounts + SA connect surface + moderation (Soon):** `managed_accounts` table, the **SuperAdmin "Managed Accounts" surface** (§4.4 — SA OAuth-connects hired.video's brand account per platform; `managedLaneReady` gating), the AI moderation gate + SA approval queue, attribution/watermark, "publish via hired.video" free lane, platform-reach analytics. LinkedIn's brand-account connect requests the **org/Community-Management scope** (≠ the member scope used for Lane B). This is the owned-reach engine — and Lane A stays disabled per platform until its brand account is connected here.
- **Phase 4 — Scheduling + batch + Distribution Hub (Mid):** `social_publish_jobs` + cron drainer (idempotent/retry-bounded), multi-destination compose, calendar/queue UI, native feed cross-post.
- **Phase 5 — Analytics ingestion + remaining platforms (Mid):** `external_post_metrics` via webhooks + cron sync, dashboard fold-in; X, Facebook Page, LinkedIn real-post adapters; manual-upload fallback polish.

Per-phase residual gaps + the deferred **cross-platform social inbox / comment management** (explicit non-goal) are tracked in the [Consolidated Gap Register](../../ROADMAP.md#consolidated-gap-register).
