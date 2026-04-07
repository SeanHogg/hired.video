# hired.video Platform

A full-stack platform for video resume creation and talent management. Combines an AI-powered resume/video builder with professional networking, recruiter tools, and multi-tenant organization management.

---

## Platform Overview

hired.video supports multiple user personas operating in the same platform:

- **Job Seekers** — Build resumes and video resumes, search/apply to jobs, network professionally
- **Recruiters** — Manage talent pools, submit candidates, track placements, communicate via outreach campaigns
- **Business Owners / Employers** — Post jobs, manage company profiles, invite team members, view analytics
- **Admins** — Platform management, affiliate oversight, billing/refund management

### Core Feature Areas

| Area | Description |
|------|-------------|
| Authentication & Security | JWT auth, email verification, 2FA, password reset, refresh tokens, OAuth (Google, LinkedIn, GitHub, Microsoft), magic links, passkeys |
| Resume Management | AI-powered builder, file parsing, versioning, analytics, cloning, publishing |
| Video Resume & Studio | AI video generation, storyboard editor, script editing, YouTube publishing |
| Job Management | Job CRUD, search, applications, alerts, AI-based matching and tailoring |
| Company Profiles | Company pages, follow system, trending, job listings |
| Professional Networking | User connections, social feed, recommendations |
| Recruiter Tools | Talent pools, submissions, placements, commission tracking |
| Communication | Conversations, email templates, campaigns, tracking, external contacts |
| AI Features | Resume scoring, optimizer, ATS analysis, value proposition, salary analysis, interview prep |
| Multi-tenant Accounts | Team invitations, role-based access, account switching |
| Billing & Payments | Subscriptions, payment methods, invoices, refunds, cancellations |
| Affiliate Program | Referral tracking, conversions, payouts |
| Admin Dashboard | Platform metrics, affiliate management, refund/cancellation approval |

---

## Tech Stack

### Backend API (`/api`)

| Concern | Technology |
|---------|-----------|
| Language | TypeScript |
| Framework | [Hono](https://hono.dev/) (lightweight, edge-native) |
| Runtime | Cloudflare Workers (edge serverless) |
| Database | PostgreSQL via [Neon](https://neon.tech/) (serverless) |
| ORM | [Drizzle ORM](https://orm.drizzle.team/) |
| Validation | [Zod](https://zod.dev/) |
| Auth | JWT (jose) + PBKDF2 password hashing |
| Email | SendPulse via `sendpulse-api` npm package |
| AI / LLM | OpenRouter API (Google Gemini Flash) |
| File Storage | AWS S3 + Cloudflare R2 |
| Error Monitoring | Sentry |
| Migrations | Drizzle Kit |

### Frontend (`/frontend`)

| Concern | Technology |
|---------|-----------|
| Framework | React 18 + TypeScript |
| Build | Vite |
| Styling | TailwindCSS 3 + shadcn/ui (Radix UI) |
| Routing | React Router 6 (SPA mode) |
| State / Data | React Query + Context API |
| Forms | React Hook Form + Zod |
| Analytics | Google Tag Manager (GTM-T6CSJ22D) |

### Legacy Reference API (`/myvideoresume-api`)

The legacy implementation is a **C# / ASP.NET Core** solution retained as a reference. It targets the same feature surface and is used as a specification for the TypeScript rewrite. See [Gap Analysis](#gap-analysis-vs-legacy-api) below.

---

## Project Structure

```
hired.video/
├── api/                          # Cloudflare Workers API (TypeScript / Hono)
│   ├── src/
│   │   ├── app.ts                # Hono app factory, route mounting, CORS
│   │   ├── worker.ts             # CF Worker fetch handler (production entry)
│   │   ├── index.ts              # Node.js entry (local development)
│   │   ├── routes/               # 60 route files — one per feature domain
│   │   ├── services/             # Business logic services (11 files + payment/ subfolder)
│   │   ├── middleware/           # Auth, error handling, rate limiting, logging
│   │   ├── db/
│   │   │   ├── schema/           # Drizzle schema definitions (134 tables)
│   │   │   └── index.ts          # DB connection
│   │   └── types/                # Shared TypeScript types, response helpers
│   ├── wrangler.toml             # Cloudflare Worker config + R2/KV bindings
│   └── drizzle.config.ts         # Migration configuration
├── frontend/                     # React SPA
│   ├── pages/                    # Route-level page components
│   ├── components/               # Reusable UI components
│   ├── lib/services/             # API service layer (one file per domain)
│   ├── hooks/                    # Custom React hooks
│   └── types/                    # Frontend TypeScript types
├── myvideoresume-api/            # Legacy C# reference implementation (read-only)
│   ├── MyVideoResume.Server/     # ASP.NET Core Web API
│   ├── MyVideoResume.Application/# Business logic services
│   ├── MyVideoResume.Data/       # EF Core DbContext + entities
│   ├── MyVideoResume.Abstractions/ # DTOs, interfaces, models
│   ├── MyVideoResume.AI/         # LLM integration
│   ├── MyVideoResume.ML.SentimentAnalysis/ # ML.NET sentiment model
│   └── MyVideoResume.Tests/      # Unit/integration tests
└── docs/                         # (consolidated into this README)
```

---

## Frontend Architecture

### Dashboard

The dashboard system uses a **role-based component loader pattern**. The main container reads the user's `rolePermissions` and renders the appropriate role-specific component.

```
/frontend/pages/Dashboard.tsx (main container — 329 lines)
/frontend/components/dashboard/
├── JobSeekerDashboard.tsx       # Profile stats, applications, job matches, interviews, messages, career progress
├── RecruiterDashboard.tsx       # Candidate pipeline, job posting stats, recruitment metrics, scheduled interviews
├── EmployerDashboard.tsx        # Team metrics, budget stats, company stats, candidate pipeline, performance summaries
├── AdminDashboard.tsx           # Platform stats, revenue stats, system health, support metrics, feature usage
├── shared/
│   ├── MetricCard.tsx           # MetricCard (single metric + trend indicator) and MetricGrid (responsive grid)
│   ├── ActivityFeed.tsx         # Activity timeline; customizable title and "View All" action
│   ├── OnboardingProgress.tsx   # Progress bar + task list; auto-hides at 100% completion
│   ├── QuickActions.tsx         # Role-based action buttons; includes Video Resume Wizard modal
│   └── index.ts                 # Re-exports all shared components
└── index.ts

/frontend/hooks/dashboard/
├── useDashboard.ts              # Fetches role-appropriate data, loading/error states, page-view analytics, Affiliate support
├── useOnboarding.ts             # Memoized progress — task list, completed count, percentage, incomplete tasks, completion flag
└── index.ts
```

**Role-based routing:**

```typescript
if (rolePermissions.isJobSeeker) {
  return <JobSeekerDashboard dashboardData={dashboardData} />;
}
```

**Importing shared components:**

```typescript
import { MetricGrid, ActivityFeed, OnboardingProgress } from "./shared";
```

**Data fetching:**

```typescript
const { dashboardData, loading, error, refreshDashboard } = useDashboard();
```

**Adding a new role dashboard:** create `NewRoleDashboard.tsx`, add the role check in `Dashboard.tsx`, import shared components as needed. Each role dashboard is self-contained.

---

## Video AI Studio Architecture

### Pipeline

```
User Prompt + Resume
        ↓
  LLM (OpenRouter)       → generates Video Script DSL
        ↓
  Video Compiler         → builds Scene Graph + Animation Graph
        ↓
  Frame Renderer         → Canvas 2D
        ↓
  WebCodecs Encoder      → VideoFrame pipeline
        ↓
  MP4 Muxer              → Blob
        ↓
  Upload → YouTube / LinkedIn / ATS Package
```

### Studio Layout (3-panel workspace)

```
┌──────────┬──────────────────────────┬──────────────────┐
│ Sidebar  │       Editor             │  Settings        │
│  260px   │       flex-1             │  320px           │
│          │  [Prompt|Storyboard]     ├──────────────────┤
│          │  [Timeline]              │  Preview         │
│          │  [Advanced Features]     │  (canvas 16:9)   │
└──────────┴──────────────────────────┴──────────────────┘
```

### Studio Files

```
frontend/pages/studio/
  Studio.tsx              ← re-export of StudioLayout
  StudioLayout.tsx        ← top-level state, layout, auth gate (1,131 lines)
  StudioSidebar.tsx       ← project nav, templates, backgrounds, music
  StudioEditor.tsx        ← Prompt / Storyboard tab switcher
  StudioPreview.tsx       ← right panel: canvas + Export + Publish + LinkedIn + visibility
  StudioSettings.tsx      ← AI settings + Video settings
  StudioFeaturesHub.tsx   ← Advanced features: 9 tabs (Record, Voiceover, Captions, Interview, Skills, Analytics, ATS, Async Interview, LinkedIn)
  ATSLandingPage.tsx      ← public shareable page at /v/ats/:slug
  AsyncInterviewPage.tsx  ← candidate interview view at /interview/:token

frontend/components/studio/     (12 components, ~7,000 lines total)
  VoiceoverPanel.tsx      ← TTS voice selection, generation, playback, word highlight
  WebcamRecorder.tsx      ← camera/screen/PiP recording, audio level meter
  Teleprompter.tsx        ← auto-scrolling text overlay, WPM control
  DeliveryCoach.tsx       ← score cards, filler words, pacing, suggestions
  CaptionEditor.tsx       ← cue editing, style selector, SRT/VTT export
  InterviewPractice.tsx   ← question library, STAR framework, AI coaching
  SkillsDemoCreator.tsx   ← template selection, AI script, recording flow
  VideoAnalyticsDashboard.tsx ← engagement heatmap, viewer list, drop-off
  ATSPackageGenerator.tsx ← shareable link, text summary, email template
  VoiceCloneManager.tsx   ← record/upload sample, manage cloned voices
  AsyncInterviewManager.tsx ← recruiter + candidate views
  LinkedInPublisher.tsx   ← OAuth connect, compose post, publish

frontend/lib/
  compiler/
    video-compiler.ts     ← compile(VideoScript) → CompiledVideo
    scene-graph.ts        ← SceneNode tree per scene type
    animation-graph.ts    ← AnimationSpec → CompiledAnimation interpolators
    storyboard-adapter.ts ← storyboardToVideoScript() backward-compat
    types.ts              ← all compiler internal interfaces
  renderer/
    canvas-nodes.ts       ← drawNode() for each SceneNode type
    frame-renderer.ts     ← render(ctx, compiledVideo, time)
    video-exporter.ts     ← exportVideo() WebCodecs + mp4-muxer + fallback
    caption-renderer.ts   ← 4 caption styles (standard, bold-pop, word-by-word, lower-thirds)
  audio/
    ambient-player.ts     ← background music playback + export mixing
  analytics/
    video-tracker.ts      ← per-second engagement tracking, beacon on unload
  services/
    studio-service.ts     ← core studio API client
    studio-features-service.ts ← TTS, captions, LinkedIn, recording, coaching, ATS, interviews, skills, voice clone, analytics

frontend/types/
  video-script.ts         ← VideoScript DSL + VoiceoverConfig + CaptionConfig + WordTimestamp
  studio.ts               ← StudioProjectState (voiceover, captions fields)

api/src/routes/
  studio.ts               ← core studio routes (1,716 lines)
  studio-features.ts      ← TTS, captions, LinkedIn, recording, coaching, ATS, interview, skills, voice clone, async interview, analytics (1,451 lines)

api/src/services/
  tts.ts                  ← ElevenLabs TTS with word timestamps, voice cloning, SRT/VTT
  transcription.ts        ← OpenAI Whisper transcription, delivery analysis (pacing, fillers, energy)
```

### Video Script DSL

The AI generates a `VideoScript` — a declarative program the compiler evaluates at any frame:

```typescript
interface VideoScript {
  video: { duration, fps, resolution, aspect, theme: { colorPalette, fontFamily, motion, transition, background }, audio? }
  scenes: SceneScript[]    // intro | achievement | skills | closing | job-details | company-culture | cta | testimonial | product-feature | brand-story | requirements | benefits
}
```

Scene types cover both job-seeker (resume) and advertising use cases. Purposes: `resume`, `job_ad`, `company_promo`, `recruiter_brand`, `product_launch`, `personal_brand`.

### Database Tables (Studio)

From `schema/videos.ts`, `schema/studioadvertising.ts`, `schema/studiofeatures.ts`:

| Table | Purpose |
|-------|---------|
| `videos` | Video records (status, R2 key, YouTube ID, privacy) |
| `video_resumes` | Video-resume associations |
| `youtube_accounts` | YouTube OAuth tokens |
| `studio_brand_kits` | Brand identity (logo, colors, font) |
| `video_analytics` | Lightweight view + CTA-click tracking |
| `video_campaigns` | Campaign grouping with UTM tracking |
| `studio_voiceovers` | TTS audio per scene with word timestamps |
| `studio_voice_clones` | User voice cloning profiles |
| `studio_captions` | Auto-generated subtitle tracks (4 styles) |
| `linkedin_accounts` | LinkedIn OAuth tokens |
| `studio_recordings` | Webcam/screen recordings with transcription |
| `studio_delivery_coaching` | AI coaching scores (pacing, fillers, energy, clarity) |
| `studio_ats_packages` | ATS-compatible shareable landing pages |
| `studio_interview_questions` | Interview question library (15 defaults) |
| `studio_interview_sessions` | Practice sessions with AI scoring |
| `studio_skills_demos` | Skills demonstration videos (4 templates) |
| `studio_async_interviews` | Employer async interview requests |
| `studio_async_responses` | Candidate video responses |
| `studio_video_heatmap` | Per-second engagement analytics |
| `stock_media_assets` | Content-addressed stock library cache (one row per `sha256(bytes)`) |
| `user_stock_media_usage` | Per-user join table — same R2 object backs many users without dup |
| `studio_project_versions` | Autosaved + manual storyboard snapshots (50/project, 30-day retention) |
| `studio_chapters` | Per-project chapter markers for YouTube-style TOC |
| `studio_video_forms` | In-video lead capture forms pinned to playback timestamps (Wistia Turnstile equivalent) |
| `studio_video_form_submissions` | Form submissions, also mirrored into `marketing_leads` |
| `studio_review_comments` | Frame.io-style time-coded review comments + threading |
| `studio_review_links` | Public shareToken-based review URLs (anonymous external reviewers) |
| `studio_thumbnails` | AI-ranked thumbnail candidates with isSelected pointer |

### Environment Variables (Studio)

| Variable | Service | Required |
|----------|---------|----------|
| `OPENROUTER_API_KEY` | LLM script generation | Yes (falls back to mock) |
| `ELEVENLABS_API_KEY` | TTS voiceover + voice cloning | For TTS features |
| `OPENAI_API_KEY` | Whisper transcription + delivery coaching | For recording features |
| `LINKEDIN_CLIENT_ID` | LinkedIn OAuth | For LinkedIn publishing |
| `LINKEDIN_CLIENT_SECRET` | LinkedIn OAuth | For LinkedIn publishing |
| `UNSPLASH_ACCESS_KEY` | Stock images (Unsplash) | For stock media library |
| `PEXELS_API_KEY` | Stock images + video (Pexels) | For stock media library |
| `PIXABAY_API_KEY` | Stock images + video (Pixabay) | For stock media library |

---

## Video Studio Capability Assessment

Evaluated against a feature specification for a fully browser-based general-purpose video editor comparable to Canva Video / CapCut. hired.video's studio is purpose-built for AI-driven video resume and employer content creation, not a traditional non-linear editor (NLE). The table below documents parity, partial coverage, and open gaps against that specification.

**Summary: 25 ✅ fully implemented · 8 ⚠️ partial · 5 ❌ not implemented (38 capabilities total)**

Open gaps against the Canva-Video / CapCut spec are tracked in the [Consolidated Gap Register](#consolidated-gap-register) as entries #124–#133. Net-new studio gaps beyond that spec (AI avatars, dubbing, audio enhancement, multi-platform publishing, in-video lead capture, chapters, thumbnails, hook optimizer, etc.) are tracked as #134–#145.

### Core Requirements

| Capability | Status | Implementation | Gap Register |
|---|---|---|---|
| Timeline-based editor | ⚠️ Partial | Scene-level timeline exists in `StudioEditor.tsx`; storyboard scenes can be reordered. No clip-level drag-and-drop NLE timeline with frame-precise scrubbing. | #124 |
| Video, audio, image, and text tracks | ⚠️ Partial | AI storyboard compiles multi-type canvas nodes (text, image, video) per scene; no manual multi-track lane UI. | — |
| Clip trimming, splitting, merging, reordering | ❌ Not implemented | Scenes are AI-generated units; no in/out point trim, split-at-playhead, or merge tooling. | #124 |
| Multi-layer editing with precision timing | ⚠️ Partial | `animation-graph.ts` supports per-node keyframe interpolation; no drag-to-reposition layer UI. | — |

### Visual Editing Features

| Capability | Status | Implementation | Gap Register |
|---|---|---|---|
| Transitions and effects (fade, slide, zoom) | ⚠️ Partial | `transition` and `motion` fields in VideoScript DSL theme; animation interpolators in `animation-graph.ts`. No manual transition picker UI between scenes. | — |
| Filters and color adjustments (brightness, contrast, saturation) | ✅ Done | `VideoFilters` in `types/video-script.ts` + `videoFiltersToCss()` applied to `StudioPreview` wrapper. 5-slider UI in `StudioSidebar` Theme section. | — |
| Text overlays, subtitles, and animations | ✅ Done | `caption-renderer.ts` — 4 styles (standard, bold-pop, word-by-word, lower-thirds). Text scene nodes with animated entry/exit. `CaptionEditor.tsx` (571 lines). | — |
| Canvas resizing (16:9, 9:16, 1:1, 4:3) | ✅ Done | `VideoAspect` extended in `types/video-script.ts`; compiler `ASPECT_MAP` covers all four. Switcher in `StudioSettings.tsx` re-renders preview canvas live. | — |

### Audio Capabilities

| Capability | Status | Implementation | Gap Register |
|---|---|---|---|
| Multi-track audio editing | ⚠️ Partial | Background music (`ambient-player.ts`) + per-scene voiceover tracks coexist; no visual multi-track mixer lane. | #129 |
| Volume control and fade in/out | ❌ Not implemented | No per-clip or per-track volume envelope or fade handles. | #129 |
| Voice-over recording | ✅ Done | `WebcamRecorder.tsx` (767 lines) — browser-native MediaRecorder. `VoiceoverPanel.tsx` (635 lines) — ElevenLabs TTS with word-level timestamps, speed control, playback preview. `Teleprompter.tsx` — auto-scroll + WPM control. | — |
| Background music and sound effects | ✅ Done | `ambient-player.ts` — background track playback + export mixing. `StudioSidebar.tsx` — music library selection. | — |

### AI-Powered Features

| Capability | Status | Implementation | Gap Register |
|---|---|---|---|
| Auto-generate subtitles/captions | ✅ Done | OpenAI Whisper transcription (`services/transcription.ts`). `POST /captions/generate`. 4 caption styles rendered by `caption-renderer.ts`. SRT/VTT export. | — |
| Text-based editing via transcript | ❌ Not implemented | Whisper produces transcripts for coaching; no transcript-driven cut/edit workflow (Descript-style). | #126 |
| Background removal (no green screen) | ❌ Not implemented | Not implemented. Would require MediaPipe Selfie Segmentation or similar WASM model. | #127 |
| AI voiceovers | ✅ Done | ElevenLabs TTS with 100+ voices + voice cloning (`VoiceCloneManager.tsx`). Per-scene generation. `services/tts.ts`. | — |

### Media & Assets

| Capability | Status | Implementation | Gap Register |
|---|---|---|---|
| User uploads (video, audio, images) | ✅ Done | R2-backed upload routes (`routes/upload.ts`). `WebcamRecorder.tsx` supports file upload in addition to live recording. | — |
| Stock media library integration | ✅ Done | Unsplash + Pexels + Pixabay aggregator (`services/stockmedia.ts`) with content-addressed dedup: one R2 object per `sha256(bytes)`, per-user picks tracked in `userStockMediaUsage`. `StockMediaPanel.tsx` in `StudioSidebar`. | — |
| Template system for common formats | ✅ Done | 3 free (720p) + 5 Premium (1080p) templates. 12 scene types. 6 purposes (`resume`, `job_ad`, `company_promo`, `recruiter_brand`, `product_launch`, `personal_brand`). `studioBrandKits` for brand consistency. | — |

### Technical Stack

| Capability | Status | Implementation | Gap Register |
|---|---|---|---|
| Frontend: React / Next.js or similar | ✅ Done | React 18 + Vite. TypeScript throughout. Tailwind + shadcn/ui. | — |
| Rendering: Canvas / WebGL / WebCodecs | ✅ Done | Canvas 2D (`frame-renderer.ts`), WebCodecs encoder (`video-exporter.ts`), Three.js / React Three Fiber for 3D elements. | — |
| Media processing: FFmpeg WASM or server fallback | ✅ Done | WebCodecs API + `mp4-muxer` / `webm-muxer` — browser-native hardware-accelerated encoding without FFmpeg dependency. Superior performance profile. | — |
| State management for timeline sync | ✅ Done | TanStack Query v5 for server state. `StudioLayout.tsx` (1,131 lines) owns local project state. | — |
| Optional backend for rendering/export | ✅ Done | Hono on Cloudflare Workers. Studio routes 3,167 lines across `studio.ts` + `studio-features.ts`. | — |

### Performance Requirements

| Capability | Status | Implementation | Gap Register |
|---|---|---|---|
| Smooth playback and scrubbing | ✅ Done | Canvas 2D `render(ctx, compiledVideo, time)` at target FPS. WebCodecs `VideoFrame` pipeline for encoding. | — |
| Efficient memory handling for large files | ⚠️ Partial | WebCodecs streams frames without full decode into memory. No explicit documented chunking/pooling strategy for large uploads. | — |
| Lazy loading and caching of media assets | ⚠️ Partial | Cloudflare R2 + CDN for assets. No explicit lazy-load or client-side LRU cache documented for timeline preview thumbnails. | — |

### Export & Sharing

| Capability | Status | Implementation | Gap Register |
|---|---|---|---|
| Export to MP4 (H.264) | ✅ Done | `video-exporter.ts` — WebCodecs `VideoEncoder` (H.264) + `mp4-muxer`. WebM fallback via `webm-muxer`. | — |
| Multiple resolutions (720p, 1080p, 4K) | ✅ Done | All three resolutions in `RESOLUTION_MAP`. 4K (3840×2160) Premium-gated server-side via `POST /api/studio/upload` (rejects with 402 PREMIUM_REQUIRED for non-Premium). | — |
| Direct sharing or download | ✅ Done | LinkedIn publish (`LinkedInPublisher.tsx`), ATS package shareable link (`ATSLandingPage.tsx`), visibility toggle (public/unlisted), embed code generation. | — |
| Cloud save and project persistence | ✅ Done | `studioProjects` persists projects. `studioProjectVersions` snapshots autosave every 30 s; `VersionHistoryDialog` exposes restore + manual snapshot. 50-version cap, 30-day retention. | — |

### Collaboration (Optional)

| Capability | Status | Implementation | Gap Register |
|---|---|---|---|
| Real-time collaborative editing | ❌ Not implemented | Not implemented. SignalR hub infrastructure exists for notifications; studio state is single-user. | #130 |
| Version history and autosave | ✅ Done | `studioProjectVersions` table + 4 routes; debounced 30 s autosave in `StudioLayout.tsx`; restore via `VersionHistoryDialog.tsx`. | — |

### Extensibility

| Capability | Status | Implementation | Gap Register |
|---|---|---|---|
| Plugin system for effects or tools | ❌ Not implemented | No hook or registry system for third-party studio plugins. | #132 |
| API for integrations | ✅ Done | OpenAPI 3.1 spec at `GET /api/openapi.json`. YouTube, LinkedIn, ATS (Greenhouse/Lever/Workday), and calendar integrations live. | — |

### UX Goals

| Capability | Status | Implementation | Gap Register |
|---|---|---|---|
| Intuitive, beginner-friendly interface | ✅ Done | AI-driven storyboard generation from a single text prompt. 3-panel workspace. shadcn/ui component system. | — |
| Fast load time, no installation required | ✅ Done | Vite bundle + Cloudflare Workers edge delivery. No desktop app required. | — |
| Responsive design (desktop-first, tablet support) | ⚠️ Partial | Tailwind responsive utilities. Studio workspace is desktop-first; no documented tablet breakpoint layout for the editor panels. | — |

---

## AI CHRO (AI Assistant)

The AI CHRO (Chief Human Resources Officer) is the platform's embedded AI assistant. Role-aware, context-sensitive career/hiring/workforce guidance.

### Architecture

```
User (browser)
  └─ AIChatPanel.tsx          ← Chat UI: sliding panel, history, copy, session tracking
       └─ ai-service.ts       ← Frontend service: sends to /api/ai/chat
            └─ /api/ai/chat   ← Hono route: session management, DB persistence
                 └─ ai.ts     ← callLLMWithMessages() → OpenRouter (Gemini Flash 1.5)
```

**Tables** (`schema/ai.ts`): `ai_chat_sessions`, `ai_chat_messages`, `ai_usage_records`

### System Prompt (3 layers)

1. **Base CHRO persona** — talent acquisition, career development, workforce strategy, HR analytics, employer branding, compliance
2. **User profile context** — name, role, plan (injected from `useAuth()`)
3. **Page context** — auto-detected from URL via `detectContextFromRoute()` (e.g. `/resumes/edit/:id` → resume editing context)

### Usage Limits

- Free: 10 requests/month (`FREE_AI_MONTHLY_LIMIT`), enforced client-side + server-side
- Pro/Enterprise: unlimited
- Client check in `ai-service.ts`; server check via `checkAIUsage` middleware

---

## Email System (SendPulse)

### Architecture

```
Route handler (auth.ts, account.ts)
  └─ getEmailProvider()       ← factory returns SendPulseEmailProvider
       └─ sendEmail()         ← OAuth2 token → SMTP API call (fire-and-forget via waitUntil)
```

### Templates

| Template | Trigger |
|----------|---------|
| Verification | Registration |
| Password reset | Forgot password |
| 2FA code | Login with 2FA enabled |
| Team invitation | `POST /api/account/invite` |
| Magic link | `POST /api/auth/magic-link` |
| Onboarding drip (3 emails) | Day 0/3/7 via cron |

### Env Variables

`EMAIL_CLIENTID`, `EMAIL_SECRET` (SendPulse OAuth), `EMAIL_FROM`, `FRONTEND_URL`

---

## Authentication

### Supported Methods

| Method | Implementation |
|--------|---------------|
| Email/password | PBKDF2-SHA256 (100K iterations, 16-byte salt) |
| OAuth (Google, LinkedIn, GitHub, Microsoft) | `oauth.ts` OIDC flows via `PROVIDERS` map |
| Magic links | 32-byte token, 15-min expiry |
| Passkeys/WebAuthn | FIDO2/ES256 via Web Crypto API (no external deps) |
| 2FA | HMAC-SHA1 TOTP (RFC 6238) |

### JWT Structure

```typescript
interface JwtPayload {
  sub: string;           // userId
  email: string;
  roles: string[];
  emailVerified: boolean;
  mustChangePassword: boolean;
  companyId?: string;
  isSuperAdmin?: boolean;
  emu?: boolean;         // impersonation token
  emuBy?: string;        // superadmin userId
}
```

### OAuth Env Variables

`GOOGLE_CLIENT_ID/SECRET`, `LINKEDIN_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET`, `MICROSOFT_CLIENT_ID/SECRET`

---

## SuperAdmin Impersonation

Allows superadmins to impersonate any user for debugging. Implementation in `services/impersonation.ts` + `routes/superadmin/`.

### Flow

1. SuperAdmin selects user → `POST /api/admin/impersonate/sessions` (mandatory reason)
2. Server issues impersonation JWT with `emu: true`, `emuBy: superadminId`, `emuSid: sessionId`
3. All actions during session logged to `impersonation_audit_log`
4. Read-only mode available (`emuReadonly: true`)
5. End session → `DELETE /api/admin/impersonate/sessions/:id`

### Permission Debugger

`GET /api/admin/impersonate/debug-permissions/:userId` — returns full permission tree: roles, features, billing tier, module access, with `allowed/denied/reason` per check.

---

## API Inventory & Implementation Status

### Middleware

| File | Status | Notes |
|------|--------|-------|
| `auth.ts` | ✅ Complete | JWT verification, sets `c.var.user` |
| `errorHandler.ts` | ✅ Complete | AppError hierarchy, Zod formatting, Sentry |
| `rateLimiter.ts` | ✅ Complete | In-memory, 100 req/60s per IP |
| `emailVerified.ts` | ✅ Complete | Applied globally in `app.ts` to all authenticated routes |
| `passwordChange.ts` | ✅ Complete | Applied globally in `app.ts` to all authenticated routes |
| `requestLogger.ts` | ✅ Complete | HTTP request/response logging |

### Routes

#### Authentication & Account Management

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `auth.ts` | POST /register, /login, /refresh, /logout, /forgot-password, /reset-password, /verify-email, /verify-2fa, /resend-2fa, /resend-email-verification; GET /verification-status, /me | ✅ Complete | Full auth flow implemented |
| `account.ts` | GET /users, /available, /invitations/pending, /invitation/:id, /settings, /analytics, /invitation-analytics; POST /invite, /accept-invitation/:id, /switch, /bulk-invite, /deleteaccount; PUT /roles; DELETE /users/:id | ✅ Complete | Multi-tenant org management |
| `users.ts` | GET /public, /:id, /check-slug/:slug, /me, /me/connections, /me/recommendations, /profile, /:id/resumes, /:id/stats, /:id/can-message; POST /connections; PUT /me, /profile, /connections/:id/accept; DELETE /account, /connections/:id; PATCH /slug | ✅ Complete | Profile + connections |
| `settings.ts` | GET /account, /job-preferences, /notifications, /security, /privacy, /export; PUT /account, /job-preferences, /notifications, /privacy, /security; POST /security/2fa/enable, /disable | ✅ Complete | User preferences |
| `password-management.ts` | GET /requirements; POST /validate-strength, /force-change | ✅ Complete | Password policy enforcement |

#### Resume Features

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `resumes.ts` | GET /, /:id, /export, /metadata, /embedded/:id, /mastergroups, /public, /validateslug, /withownership; POST /, /clone, /createvariation, /promote, /publish, /setactive, /setmaster, /setprivacy, /createfromfile, /parse, /save, /watch/:id, /unwatch/:id; PUT /:id, /:id/metadata; DELETE /:id | ✅ Complete | Core resume CRUD + lifecycle |
| `resume-scorer.ts` | POST /score, /category-breakdown, /recommendations | ✅ Complete | AI-powered scoring |
| `resume-optimizer.ts` | POST /optimize, /ats-analysis, /keyword-suggestions | ✅ Complete | ATS optimization |
| `resume-roast.ts` | POST /roast | ✅ Complete | AI feedback tool |
| `sentiment.ts` | POST /sentimentprediction, /resume/sentimentprediction | ✅ Complete | Sentiment analysis |

#### Video & Studio

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `video.ts` | GET /:id, /:id/status, /resume/:resumeId, /resume/:resumeId/active, /resume/:resumeId/can-generate, /user/all; POST /generate, /:id/cancel, /enhance-summary; DELETE /:id | ✅ Complete | Video generation lifecycle |
| `studio.ts` | POST /save-draft, /publish, /storyboard, /generate-image, /edit-script, /upload, /brand-kits, /campaigns, /videos/:id/view, /videos/:id/cta-click; GET /projects, /public/:videoId, /videos/public, /videos/resume/:resumeId, /videos/user/:userId, /status/:projectId, /brand-kits, /ad-templates, /campaigns, /videos/:id/embed, /videos/:id/analytics; DELETE /projects/:projectId; PATCH /projects/:projectId/status, /projects/:projectId/visibility; POST /projects/:id/clone | ✅ Complete | 1,716 lines — largest route file |
| `studio-features.ts` | GET /tts/voices, /captions/:projectId, /linkedin/auth-url, /linkedin/accounts, /coaching/:recordingId, /interview/questions, /interview/sessions, /skills-demos, /skills-demos/user/:userId, /voice-clones, /async-interviews, /async-interview/invite/:token, /async-interview/:id/responses, /analytics/:videoId; POST /tts/generate, /tts/generate-all, /captions/generate, /linkedin/callback, /linkedin/publish, /linkedin/post, /recording/upload, /recording/:id/transcribe, /coaching/analyze, /ats/generate, /interview/questions/seed, /interview/session, /skills-demo, /skills-demo/generate-script, /voice-clones, /async-interview, /async-interview/:id/respond, /async-interview/:id/submit, /analytics/track; PATCH /interview/session/:id, /skills-demo/:id; DELETE /voice-clones/:id; GET /ats/:slug | ✅ Complete | 1,451 lines — TTS, captions, LinkedIn, webcam, coaching, ATS, interview practice, skills demos, voice cloning, async interviews, heatmap analytics |

#### Jobs & Matching

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `jobs.ts` | GET /, /:id, /public, /slug/:slug, /GetSummaryItems, /saved, /alerts, /applications, /user-jobs; POST /, /:id/apply, /:id/save, /createfromfile, /extract, /alerts; PUT /:id, /alerts/:id; DELETE /:id, /:id/save; PATCH /alerts/:id/toggle | ✅ Complete | Full job lifecycle + alerts |
| `match.ts` | POST /, /analyze, /bycontent, /byid, /tailor | ✅ Complete | Resume-to-job matching |
| `search.ts` | GET /public | ⚠️ Partial | Single endpoint; legacy has richer search — see Gap Register #10 |

#### Companies

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `companies.ts` | GET /public, /:id, /:id/jobs, /:id/stats, /:id/following-status, /slug/:slug, /trending, /me/followed; POST /, /:id/follow; PUT /:id; DELETE /:id, /:id/follow | ✅ Complete | Company profiles + follow system |

#### Recruiter Tools

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `recruiter.ts` | GET /talent-pool, /submissions, /placements, /placements/summary/commission, /interactions/:talentPoolId; POST /talent-pool, /submissions, /placements, /interactions; PUT /talent-pool/:id, /submissions/:id/status, /placements/:id/commission, /placements/:id/guarantee; DELETE /talent-pool/:id; POST /submissions/:id/withdraw | ✅ Complete | 618 lines |

#### Communication

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `messages.ts` | POST /, /message | ⚠️ Partial | Minimal — direct messages only; no conversation threading, read receipts, or history — see Gap Register #45 |
| `communication.ts` | GET /conversations, /messages, /email-templates, /email-campaigns, /tracking, /stats, /job-boards, /external-contacts; POST /conversations, /messages, /messages/mark-read, /email-templates, /email-campaigns, /email-campaigns/:id/send, /tracking, /job-boards/post, /external-contacts, /follow-ups; PUT /email-templates/:id, /external-contacts/:id; DELETE /email-templates/:id, /external-contacts/:id, /job-boards/postings/:id | ✅ Complete | 318 lines |

#### AI Features

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `ai.ts` | POST /context, /chat, /chat/sessions, /chat/sessions/:id | ✅ Complete | Full AI chat with session persistence, history, usage tracking; `/chat` added after initial table |
| `value-proposition.ts` | POST /generate/content, /generate/job-content-resume-id, /generate/job-id-resume-content, /generate/job-id-resume-id | ✅ Complete | 4 generation modes |
| `salary.ts` | POST /analyze, /negotiation-tips | ✅ Complete | Salary calculator |
| `interview.ts` | GET /sessions, /sessions/:id; POST /sessions, /sessions/:id/answers, /questions, /answers/:answerId/analyze; DELETE /sessions/:id; PATCH /sessions/:id/complete | ✅ Complete | 489 lines |

#### Dashboard & Analytics

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `dashboard.ts` | GET /, /admin, /employer, /jobseeker, /recruiter; POST /activity, /engagement, /profile-view, /refresh | ✅ Complete | Role-specific dashboards |

#### Social Feed

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `feed.ts` | GET /posts, /posts/:id, /posts/:id/comments, /search; POST /posts, /posts/:id/like, /comments, /link-preview; PUT /posts/:id, /comments/:id; DELETE /posts/:id, /posts/:id/like, /comments/:id | ✅ Complete | 389 lines |

#### Billing & Payments

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `billing.ts` | GET /subscription, /payment-methods, /invoices, /ai-usage/month, /refund-policy, /refund-reasons, /refund-requests; POST /refund-request, /cancel-account | ✅ Complete | Real DB queries for subscriptions, invoices, payment methods, AI usage |
| `payment.ts` | GET /public-key; POST /setup-intent, /save-payment-method, /stripe/webhook, /create-setup-session; DELETE /payment-methods/:id | ✅ Complete | Stripe fully wired — webhook verified, customer IDs persisted |

#### Admin & Affiliates

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `admin.ts` | GET /, /affiliate-stats, /productdashboard/affiliate-stats, /export/:format, /refund-requests, /refund-stats, /cancellation-requests; POST /refund-requests/:id/approve, /reject, /cancellation-requests/:id/approve, /reject | ✅ Complete | Admin management panel |
| `affiliates.ts` | GET /profile, /dashboard, /admin/all, /admin/:userId/details, /admin/pending-payouts; POST /payout/request, /admin/:userId/activate, /deactivate, /admin/payout/:payoutId/approve, /reject, /process | ✅ Complete | Full affiliate program |

#### Integrations & Utilities

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `upload.ts` | POST /, /image, /single, /video; DELETE /:key | ✅ Complete | S3/R2 upload handling |
| `youtube.ts` | GET /account, /auth-url, /company/auth-url, /company/status; POST /callback, /disconnect, /publish/:videoId | ✅ Complete | YouTube OAuth + publishing |
| `linkedin-post.ts` | POST /linkedin-post | ✅ Complete | LinkedIn post generation; full OAuth flow now in `studio-features.ts` |
| `locations.ts` | GET /countries, /states, /cities, /search | ✅ Complete | Reference data |
| `og.ts` | GET /v/:videoId | ✅ Complete | Open Graph metadata |
| `task.ts` | GET /, /:id; POST /save, /:id; DELETE /:id | ✅ Complete | Task management |
| `featureflag.ts` | GET / | ✅ Complete | Orphaned duplicate `feature-flag.ts` deleted; static flag evaluation |
| `hubs.ts` | GET/POST /notifications, POST /notifications/negotiate | ✅ Complete | SSE stream live; `POST /negotiate` returns transport descriptor |
| `marketing.ts` | GET /campaigns, /leads; POST /campaigns, /leads | ✅ Complete | Real DB tables wired — see Gap Register #38 |

#### Auth Extensions

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `oauth.ts` | GET /:provider, /:provider/callback; POST /magic-link; GET /magic-link/verify, /linked-accounts, /sessions; DELETE /unlink/:provider, /sessions/:id, /sessions; POST /add-password | ✅ Complete | Google, LinkedIn, GitHub, Microsoft OIDC flows; magic links; session management |
| `passkeys.ts` | POST /register/begin, /register/complete, /login/begin, /login/complete; GET /credentials; DELETE /credentials/:id | ✅ Complete | Full FIDO2/WebAuthn — CBOR parsing, DER→raw sig conversion, clone detection |

#### Notifications & Real-time

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `notifications.ts` | GET /, /unread-count, /smart; POST /mark-all-read, /:id/mark-read; DELETE /:id | ✅ Complete | Smart priority ranking (Premium) via `GET /smart` |

#### Calendar & Scheduling

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `calendar.ts` | GET /events, /events/:id, /availability, /connections, /connect/:provider, /connect/:provider/callback; POST /events, /availability, /sync, /interview-slots, /book-interview; PATCH /events/:id; DELETE /events/:id, /availability/:id, /connections/:id | ✅ Complete | Google + Outlook OAuth; two-way calendar sync; interview slot generation |

#### Outreach & Follow-ups

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `followups.ts` | GET /sequences, /sequences/:id, /enrollments; POST /sequences, /enroll, /trigger; PATCH /enrollments/:id/:action; DELETE /sequences/:id | ✅ Complete | Multi-step outreach sequences; behaviour-triggered enrollment |

#### Assessments

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `assessments.ts` | GET /, /:slug, /me/results, /users/:userId/badges; POST /:slug/start, /attempts/:attemptId/submit | ✅ Complete | Timed skill tests with AI grading; public badge display |

#### ATS & Integrations

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `ats.ts` | GET /connections; POST /connections, /sync/:connectionId, /webhook/:provider; DELETE /connections/:id | ⚠️ Partial | HMAC-verified webhook; provider API calls are stubs pending dev credentials |

#### Performance Management

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `performance.ts` | GET /cycles, /cycles/:id, /reviews, /goals; POST /cycles, /reviews, /goals; PATCH /cycles/:id/complete, /reviews/:id/submit, /reviews/:id/acknowledge, /goals/:id, /goals/:id/progress; DELETE /goals/:id | ✅ Complete | OKRs, review cycles, employee sign-off |

#### Onboarding & Hiring

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `onboarding-hiring.ts` | GET /offers, /offers/:id, /checklists, /checklists/:id; POST /offers, /offers/:id/send-for-signature, /offers/webhook/dropbox-sign; PATCH /offers/:id/send, /offers/:id/accept, /offers/:id/decline, /checklists/:id/tasks/:taskId/complete; DELETE /offers/:id | ✅ Complete | Offer letters + Dropbox Sign e-signature; HMAC-verified webhook |

#### Discovery & Smart Job Board

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `discovery.ts` | GET /talent-feed, /talent-feed/:userId, /jobs, /jobs/:id/similar, /seo/resume-guide/:jobSlug, /seo/salary/:jobSlug, /creators/leaderboard, /creators/products; POST /creators/products | ✅ Complete | Algorithmic talent feed; NL job search; SEO content engine with 24h cache |

#### White-label & B2B

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `whitelabel.ts` | GET /tenants, /tenants/:id, /portal/:subdomain, /tenants/:id/analytics, /roi-calculator; POST /tenants, /demo-request; PATCH /tenants/:id | ✅ Complete | Multi-tenant portals; ROI calculator; university/bootcamp tenant types |

#### Ads & Analytics

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `ads.ts` | GET /config; POST /ads/impression | ✅ Complete | Ad-free flag for Premium; impression tracking |
| `analytics.ts` | POST /beacon, /ads/impression; GET /usage, /time-to-hire, /hiring-metrics | ✅ Complete | DAU/WAU/MAU, feature adoption, ad CTR, time-to-hire (Premium) |

#### API Keys & Exclusive Boards

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `apikeys.ts` | GET /; POST /; DELETE /:id; PATCH /:id | ✅ Complete | SHA-256 hashed keys shown once at creation; Premium tier |
| `exclusive-boards.ts` | GET /exclusive, /exclusive/:id, /bids; POST /bids; DELETE /bids/:id; PATCH /bids/:id/accept, /bids/:id/reject | ✅ Complete | Premium exclusive job boards with bidding/auction |

#### Auto-Apply & Job Scraper

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `auto-apply.ts` | POST /start; GET /matches | ✅ Complete | LLM tailors cover letter + resume per job; Premium-gated |
| `jobscraper.ts` | Admin: GET /, POST /, PATCH /:id, DELETE /:id, POST /:id/sync, GET /:id/logs; User: GET /, POST /, PATCH /:id, DELETE /:id | ✅ Complete | RSS + JSON API sources; SHA-256 dedup; cron-driven sync |

#### Apply Button & Community

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `apply-button.ts` | GET /snippet, /:jobId/meta; POST /track | ✅ Complete | Embeddable `<script>` tag; lead capture; public routes |
| `community.ts` | GET /posts, /channels; POST /posts; DELETE /posts/:id | ✅ Complete | Company community feed with channel-based discussions |

#### OpenAPI & Sitemap

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `openapi.ts` | GET /openapi.json, /docs | ✅ Complete | OpenAPI 3.1 spec; `/docs` redirects to Swagger UI |
| `sitemap.ts` | GET /sitemap.xml | ✅ Complete | Dynamic XML sitemap for SEO |

### Services

| Service | Lines | Status | Notes |
|---------|-------|--------|-------|
| `email.ts` | 576 | ✅ Complete | `EmailProvider` interface + SendPulse implementation; sends verification, reset, 2FA, resend emails |
| `ai.ts` | 83 | ✅ Complete | `callLLM()` / `callLLMJson()` with Zod schema validation; OpenRouter wrapper |
| `account.ts` | 300 | ✅ Complete | Organization/team management business logic |
| `job.ts` | 278 | ✅ Complete | Job management: create, update, archive, search |
| `company.ts` | 84 | ✅ Complete | Company CRUD, follow/unfollow, trending |
| `settings.ts` | 76 | ✅ Complete | User preference read/write |
| `billing.ts` | 378 | ✅ Complete | Real DB queries for subscriptions, invoices, payment methods, AI usage |
| `jobscraper.ts` | 231 | ✅ Complete | RSS + JSON API scraper, SHA-256 dedup, sync scheduling |
| `stripe.ts` | 106 | ✅ Complete | Top-level Stripe helper used by payment routes |
| `payment/` | — | ✅ Complete | Strategy pattern: `types.ts` interface + `stripe.ts` (full) + `helcim.ts` (⚠️ stub) + `index.ts` factory |

### Database Schema (118 tables in `/api/src/db/schema/`)

All tables are defined and schema migrations managed via Drizzle Kit.

| Domain | Tables |
|--------|--------|
| Users & Auth | `users`, `userProfiles`, `userRoles`, `roles`, `passwordHistory`, `twoFactorCodes`, `emailVerificationTokens`, `passwordResetTokens`, `refreshTokens`, `userConnections`, `magicLinkTokens`, `oauthAccounts`, `apiKeys` |
| WebAuthn / Passkeys | `webauthnCredentials`, `webauthnChallenges` |
| Companies & Orgs | `companyProfiles`, `userCompanyRoleAssociations`, `companyFollowers`, `accountInvitations`, `accountPreferences`, `companySubscriptions`, `employerBrandingPages` |
| Resumes | `resumeInformation`, `resumeTemplates`, `watchedResumes`, `metaResumes` |
| Jobs | `jobItems`, `jobPreferences`, `jobApplications`, `savedJobs`, `jobAlerts`, `jobWebsites`, `jobBoardSources`, `jobBoardSyncLog` |
| Video & Studio | `videos`, `videoResumes`, `studioProjects`, `youtubeAccounts`, `studioBrandKits`, `videoAnalytics`, `videoCampaigns` |
| Recruiter | `recruiterTalentPools`, `talentPoolCandidates`, `candidateInteractions`, `candidateSubmissions`, `placements`, `jobBoards`, `jobBoardPostings`, `recruiterAgentRuns`, `savedSearches`, `exclusiveBoards`, `boardBids` |
| Messaging | `conversations`, `conversationParticipants`, `messages`, `messageReadReceipts`, `emailTemplates`, `emailCampaigns`, `emailCampaignRecipients`, `communicationTracking` |
| Outreach & Follow-ups | `followUpSequences`, `followUpSteps`, `followUpEnrollments`, `followUpLogs` |
| Social | `feedPosts`, `feedPostLikes`, `feedPostComments` |
| Interviews | `interviewSessions`, `interviewAnswers`, `interviews`, `applicationNotes` |
| Assessments | `skillAssessments`, `assessmentAttempts` |
| Calendar & Scheduling | `calendarConnections`, `scheduledEvents`, `availabilitySlots` |
| Onboarding & Hiring | `offerLetters`, `onboardingChecklists`, `onboardingTasks` |
| Performance | `performanceCycles`, `performanceReviews`, `performanceGoals` |
| ATS Integration | `atsConnections` |
| Affiliate | `affiliateProfiles`, `affiliateReferrals`, `affiliateConversions`, `affiliatePayouts`, `affiliateTiers`, `affiliateLinkClicks` |
| Billing | `subscriptionPlans`, `subscriptions`, `paymentMethods`, `invoices`, `invoiceLineItems`, `refundRequests`, `billingEvents`, `usageRecords` |
| Analytics | `profileViews`, `activityLogs`, `requestLogs`, `dashboardMetrics`, `userEngagementMetrics`, `aiUsageRecords`, `aiChatSessions`, `aiChatMessages` |
| Productivity | `tasks`, `boards`, `notifications`, `queueJobToResume`, `queueJobToProcess` |
| Locations | `countries`, `stateProvinces`, `cities`, `postalZipCodes` |
| White-label | `whitelabelTenants` |
| System | `systemSettings`, `marketingLeads`, `featureFlags` |

---

## Legacy API Coverage Map

This section documents every controller in `/myvideoresume-api` (31 C# controllers, ~200 endpoints), the business-logic service it calls, the DB tables it touches, and whether the TypeScript API has a matching implementation.

**Coverage key:**
✅ Fully covered — TypeScript API has equivalent endpoints with DB-backed logic
⚠️ Partial — Routes exist but logic is stubbed, missing, or incomplete
❌ Not covered — No equivalent in TypeScript API

### Authentication & User Management

| Legacy Controller | Route | Business Logic | DB Tables | TS Coverage |
|-------------------|-------|---------------|-----------|-------------|
| **AuthController** | `POST /api/auth/login` | UserManager.CheckPasswordSignInAsync, issues 2FA challenge token | AspNetUsers, PasswordHistory | ✅ `routes/auth.ts` |
| | `POST /api/auth/register` | Creates user + roles + affiliate profile; sends verification email | AspNetUsers, AspNetUserRoles, AffiliateProfiles | ✅ |
| | `POST /api/auth/verify-2fa` | Validates OTP; sends welcome email on first login; marketing email (30-day cooldown) | AspNetUsers, TwoFactorCodes | ✅ |
| | `POST /api/auth/resend-2fa` | Resends 2FA code via email | TwoFactorCodes | ✅ |
| | `POST /api/auth/refresh` | Issues new JWT + refresh token | RefreshTokens | ✅ |
| | `POST /api/auth/logout` | Invalidates refresh token | RefreshTokens | ✅ |
| | `GET /api/auth/me` | Returns current user from JWT | AspNetUsers | ✅ |
| | `POST /api/auth/resend-email-verification` | Rate-limited (1/min, 5/24h); sends verification email | EmailVerificationTokens | ✅ |
| | `GET /api/auth/verification-status` | Returns emailVerified flag | AspNetUsers | ✅ |
| **AccountApiController** | `GET /api/account/users` | List users in account | AspNetUsers, UserRoles | ✅ `routes/account.ts` |
| | `POST /api/account/invite` | Email invitation to join account | AccountInvitations | ✅ |
| | `POST /api/account/bulk-invite` | Bulk team invite | AccountInvitations | ✅ |
| | `POST /api/account/accept-invitation/:id` | Accept invite (no auth) | AccountInvitations, UserRoles | ✅ |
| | `POST /api/account/switch` | Switch active account context | UserRoles | ✅ |
| | `PUT /api/account/roles` | Update user role assignments | AspNetUserRoles | ✅ |
| | `DELETE /api/account/users/:id` | Remove user from account | AspNetUserRoles | ✅ |
| | `GET /api/account/analytics` | Invitation/account metrics | AccountInvitations | ✅ |
| | `GET /api/account/invitation/:id` | Get invitation details (no auth) | AccountInvitations | ✅ |
| | `POST /api/account/deleteaccount` | Soft-delete account | AspNetUsers | ✅ |
| **ApplicationUsersController** | `odata/Identity` (5 endpoints) | UserManager via OData | AspNetUsers | ❌ OData not needed for edge runtime |
| **ApplicationRolesController** | `odata/Identity` (4 endpoints) | RoleManager via OData | AspNetRoles | ❌ OData not needed for edge runtime |

### Resume Management

| Legacy Controller | Route | Business Logic | DB Tables | TS Coverage |
|-------------------|-------|---------------|-----------|-------------|
| **ResumeController** | `GET /api/resume/:id` | Privacy check + view tracking | ResumeInformation, ResumeViews | ✅ `routes/resumes.ts` |
| | `GET /api/resume/embedded/:id` | Bypass auth/privacy for embed | ResumeInformation | ✅ |
| | `GET /api/resume/public` | Paginated public resumes | ResumeInformation | ✅ |
| | `GET /api/resume/GetResumesOwnedByAuthUser` | Master/variation hierarchy | ResumeInformation, MetaResume | ✅ |
| | `POST /api/resume/Save` | Create/update resume JSON | ResumeInformation | ✅ |
| | `POST /api/resume/Parse` | PDF/DOCX → structured JSON via AI | ResumeInformation | ✅ |
| | `POST /api/resume/CreateFromFile` | Upload → parse → create + queue matching | ResumeInformation, QueueJobToResume | ⚠️ File parsing works; background queue not processed — see Gap Register #3 |
| | `POST /api/resume/Summarize` | AI-generated summary via LLM | ResumeInformation | ✅ |
| | `POST /api/resume/SentimentPrediction` | ML sentiment score | ResumeSentiment | ✅ (LLM-based instead of ML.NET) |
| | `DELETE /api/resume/:id` | Owner-only delete | ResumeInformation | ✅ |
| | `PUT /api/resume/:id` | Full update with master propagation | ResumeInformation, MetaResume | ✅ |
| | `PUT /api/resume/:id/metadata` | Metadata-only update | MetaResume | ✅ |
| | `POST /api/resume/:id/clone` | Duplicate resume | ResumeInformation | ✅ |
| | `POST /api/resume/:id/setMaster` | Designate master resume | ResumeInformation | ✅ |
| | `POST /api/resume/:id/setActive` | Set active resume | ResumeInformation | ✅ |
| | `POST /api/resume/:id/setPrivacy` | Set visibility level | ResumeInformation | ✅ |
| | `POST /api/resume/:id/createVariation` | Create variation from master | ResumeInformation | ✅ |
| | `POST /api/resume/:id/promote` | Promote variation → master | ResumeInformation | ✅ |
| | `GET /api/resume/masterGroups` | Master + variation groups | ResumeInformation, MetaResume | ✅ |
| | `GET /api/resume/:id/diff` | Field-level diff vs master | ResumeInformation | ❌ Not implemented |
| | `POST /api/resume/watch/:id` | Subscribe to resume updates | WatchedResumes | ✅ |
| | `POST /api/resume/unwatch/:id` | Unsubscribe | WatchedResumes | ✅ |
| | `POST /api/resume/:id/publish` | Publish resume publicly | ResumeInformation | ✅ |
| | `GET /api/resume/validateSlug` | Check slug availability | ResumeInformation | ✅ |
| **ResumeScorerController** | `POST /api/resumescorer/score` | 6-category scoring (content 25%, format 20%, keywords 20%, experience 15%, education 10%, appeal 10%) | — | ✅ `routes/resume-scorer.ts` |
| | `POST /api/resumescorer/category-breakdown` | Detailed per-category scores | — | ✅ |
| | `POST /api/resumescorer/recommendations` | Improvement suggestions | — | ✅ |
| **ResumeOptimizerController** | `POST /api/resumeoptimizer/optimize` | ATS optimization pass | — | ✅ `routes/resume-optimizer.ts` |
| | `POST /api/resumeoptimizer/ats-analysis` | ATS compatibility score | — | ✅ |
| | `POST /api/resumeoptimizer/keyword-suggestions` | Industry keyword suggestions | — | ✅ |

### Jobs & Matching

| Legacy Controller | Route | Business Logic | DB Tables | TS Coverage |
|-------------------|-------|---------------|-----------|-------------|
| **JobController** | `GET /api/job/GetPublicJobs` | Paginated + filtered public jobs | Jobs | ✅ `routes/jobs.ts` |
| | `GET /api/job/:id` | Job + view tracking | Jobs, JobViews | ✅ |
| | `POST /api/job` | Create job posting | Jobs | ✅ |
| | `PUT /api/job/:id` | Update job | Jobs | ✅ |
| | `DELETE /api/job/:id` | Owner-only delete | Jobs | ✅ |
| | `POST /api/job/Extract` | Web-scrape job from URL | Jobs | ✅ |
| | `POST /api/job/CreateFromFile` | Upload → AI-extract → create | Jobs | ✅ |
| | `POST /api/job/:id/apply` | Apply to job | JobApplications | ✅ |
| | `POST /api/job/:id/save` | Bookmark job | SavedJobs | ✅ |
| | `DELETE /api/job/:id/save` | Remove bookmark | SavedJobs | ✅ |
| | `GET /api/job/saved` | User's saved jobs | SavedJobs | ✅ |
| | `GET /api/job/applications` | User's applications | JobApplications | ✅ |
| | `GET /api/job/alerts` | User's job alerts | JobAlerts | ✅ |
| | `POST /api/job/alerts` | Create alert | JobAlerts | ✅ |
| | `PUT /api/job/alerts/:id` | Update alert | JobAlerts | ✅ |
| | `PATCH /api/job/alerts/:id/toggle` | Toggle alert on/off | JobAlerts | ✅ |
| | `DELETE /api/job/alerts/:id` | Delete alert | JobAlerts | ✅ |
| **MatchController** | `POST /api/match/analyze` | Job HTML vs resume match score + missing skills | — | ✅ `routes/match.ts` |
| | `POST /api/match/tailor` | AI-rewrite resume for job | ResumeInformation | ✅ |
| | `POST /api/match/byid` | Match by DB IDs | ResumeInformation, Jobs | ✅ |
| | `POST /api/match/bycontent` | Match by raw text | — | ✅ |
| | `POST /api/match/bestresume` | Find best-fit resume for job | ResumeInformation | ✅ |

### Video & Studio

| Legacy Controller | Route | Business Logic | DB Tables | TS Coverage |
|-------------------|-------|---------------|-----------|-------------|
| **VideoController** | `POST /api/video/generate` | AI video generation job | Videos, VideoGenerationJobs | ✅ `routes/video.ts` |
| | `GET /api/video/:id` | Get video (owner) | Videos | ✅ |
| | `GET /api/video/user/all` | All user videos | Videos | ✅ |
| | `GET /api/video/resume/:resumeId` | Videos for resume | Videos | ✅ |
| | `GET /api/video/:id/status` | Generation progress | Videos | ✅ |
| | `POST /api/video/:id/cancel` | Cancel generation | Videos | ✅ |
| | `DELETE /api/video/:id` | Delete video | Videos | ✅ |
| | `POST /api/video/enhance-summary` | AI-enhanced summary | — | ✅ |
| | `GET /api/video/resume/:id/can-generate` | Check generation eligibility | Videos, Subscriptions | ✅ |
| | `GET /api/video/resume/:id/active` | Active generation | Videos | ✅ |

### Users, Connections & Social

| Legacy Controller | Route | Business Logic | DB Tables | TS Coverage |
|-------------------|-------|---------------|-----------|-------------|
| **UsersController** | `GET /api/users/public` | Paginated public profiles | UserProfiles | ✅ `routes/users.ts` |
| | `GET /api/users/:id` | Profile by ID or slug | UserProfiles | ✅ |
| | `GET /api/users/me` | Current user profile | UserProfiles | ✅ |
| | `PUT /api/users/me` | Update profile | UserProfiles | ✅ |
| | `POST /api/users/connections` | Send connection request | UserConnections | ✅ |
| | `GET /api/users/me/connections` | Accepted connections | UserConnections | ✅ |
| | `GET /api/users/me/connections/pending` | Pending requests | UserConnections | ✅ |
| | `PUT /api/users/connections/:id/accept` | Accept request | UserConnections | ✅ |
| | `DELETE /api/users/connections/:id` | Reject/remove connection | UserConnections | ✅ |
| | `GET /api/users/:id/resumes` | User's public resumes | ResumeInformation | ✅ |
| | `POST /api/users/me/avatar` | Avatar upload (max 5MB, jpg/png/gif/webp) | UserProfiles | ⚠️ Upload route exists; avatar-specific validation not confirmed — see Gap Register #46 |
| **FeedController** | `GET /api/feed/posts` | Paginated feed | FeedPosts | ✅ `routes/feed.ts` |
| | `POST /api/feed/posts` | Create post | FeedPosts | ✅ |
| | `PUT /api/feed/posts/:id` | Edit post | FeedPosts | ✅ |
| | `DELETE /api/feed/posts/:id` | Delete post | FeedPosts | ✅ |
| | `POST /api/feed/posts/:id/like` | Like | FeedPostLikes | ✅ |
| | `DELETE /api/feed/posts/:id/like` | Unlike | FeedPostLikes | ✅ |
| | `POST /api/feed/comments` | Comment | FeedPostComments | ✅ |
| | `PUT /api/feed/comments/:id` | Edit comment | FeedPostComments | ✅ |
| | `DELETE /api/feed/comments/:id` | Delete comment | FeedPostComments | ✅ |
| | `POST /api/feed/link-preview` | Fetch link metadata | — | ✅ |

### Companies

| Legacy Controller | Route | Business Logic | DB Tables | TS Coverage |
|-------------------|-------|---------------|-----------|-------------|
| **CompaniesController** | `GET /api/companies/public` | Public company listing | CompanyProfiles | ✅ `routes/companies.ts` |
| | `GET /api/companies/:id` | Company detail + stats | CompanyProfiles | ✅ |
| | `PUT /api/companies/:id` | Update (owner) | CompanyProfiles | ✅ |
| | `DELETE /api/companies/:id` | Delete (owner) | CompanyProfiles | ✅ |
| | `POST /api/companies/:id/follow` | Follow company | CompanyFollowers | ✅ |
| | `DELETE /api/companies/:id/follow` | Unfollow | CompanyFollowers | ✅ |
| | `GET /api/companies/:id/jobs` | Company's jobs | Jobs | ✅ |

### Recruiter Tools

| Legacy Controller | Route | Business Logic | DB Tables | TS Coverage |
|-------------------|-------|---------------|-----------|-------------|
| **RecruiterController** | `POST /api/recruiter/talent-pool` | Add candidate | RecruiterTalentPools, TalentPoolCandidates | ✅ `routes/recruiter.ts` |
| | `GET /api/recruiter/talent-pool` | List pool (paginated, filtered) | RecruiterTalentPools | ✅ |
| | `PUT /api/recruiter/talent-pool/:id` | Update candidate entry | TalentPoolCandidates | ✅ |
| | `DELETE /api/recruiter/talent-pool/:id` | Remove from pool | TalentPoolCandidates | ✅ |
| | `POST /api/recruiter/interactions` | Log interaction | CandidateInteractions | ✅ |
| | `POST /api/recruiter/submissions` | Submit candidate for job | CandidateSubmissions | ✅ |
| | `PUT /api/recruiter/submissions/:id/status` | Update submission status | CandidateSubmissions | ✅ |
| | `POST /api/recruiter/submissions/:id/withdraw` | Withdraw submission | CandidateSubmissions | ✅ |
| | `POST /api/recruiter/placements` | Record placement | Placements | ✅ |
| | `GET /api/recruiter/placements/summary/commission` | Commission summary | Placements | ✅ |
| | `POST /api/recruiter/talent-pool/bulk/*` | Bulk tag/status/delete | TalentPoolCandidates | ❌ Bulk operations not implemented in TS API |
| | `GET /api/recruiter/talent-pool/export` | CSV export of talent pool | TalentPoolCandidates | ❌ Not implemented |

### Communication & Messaging

| Legacy Controller | Route | Business Logic | DB Tables | TS Coverage |
|-------------------|-------|---------------|-----------|-------------|
| **CommunicationController** | `GET /api/communication/conversations` | List conversations | Conversations, ConversationParticipants | ✅ `routes/communication.ts` |
| | `POST /api/communication/conversations` | Create conversation | Conversations | ✅ |
| | `GET /api/communication/conversations/:id` | Thread + messages | Conversations, Messages | ✅ |
| | `POST /api/communication/messages` | Send message | Messages | ✅ |
| | `POST /api/communication/messages/mark-read` | Mark as read | MessageReadReceipts | ✅ |
| | `GET /api/communication/email-templates` | List templates | EmailTemplates | ✅ |
| | `POST /api/communication/email-templates` | Create template | EmailTemplates | ✅ |
| | `PUT /api/communication/email-templates/:id` | Update template | EmailTemplates | ✅ |
| | `DELETE /api/communication/email-templates/:id` | Delete template | EmailTemplates | ✅ |
| | `GET /api/communication/email-campaigns` | List campaigns | EmailCampaigns | ✅ |
| | `POST /api/communication/email-campaigns/:id/send` | Execute campaign | EmailCampaigns, EmailCampaignRecipients | ✅ |
| | `GET /api/communication/external-contacts` | List contacts | ExternalContacts | ✅ |
| | `POST /api/communication/external-contacts` | Add contact | ExternalContacts | ✅ |
| | `GET /api/communication/job-boards` | List job boards | JobBoards | ✅ |
| | `POST /api/communication/job-boards/post` | Post job to board | JobBoardPostings | ✅ |
| | `GET /api/communication/stats` | Campaign stats | CommunicationTracking | ✅ |
| | `GET /api/communication/tracking` | Open/click events | CommunicationTracking | ✅ |

### Billing & Payments

| Legacy Controller | Route | Business Logic | DB Tables | TS Coverage |
|-------------------|-------|---------------|-----------|-------------|
| **BillingController** | `GET /api/billing/subscription` | Subscription summary | Subscriptions, SubscriptionPlans | ✅ `routes/billing.ts` (DB-backed) |
| | `GET /api/billing/payment-methods` | Saved payment methods | PaymentMethods | ✅ |
| | `GET /api/billing/invoices` | Invoice history | Invoices | ✅ |
| | `GET /api/billing/ai-usage/month` | Monthly token usage | AIUsageRecords | ✅ |
| | `POST /api/billing/refund-request` | Create refund request | RefundRequests | ✅ |
| | `GET /api/billing/refund-requests` | List user's refunds | RefundRequests | ✅ |
| | `POST /api/billing/cancel-account` | Account cancellation request | RefundRequests | ✅ |
| **PaymentController** | `POST /api/payment/stripe/webhook` | Handle Stripe events (subscription updates, payment success/fail) | BillingEvents, Subscriptions | ✅ `routes/payment.ts` — signature verified; handles subscription lifecycle, invoice sync, affiliate conversions, payouts |
| | `GET /api/payment/public-key` | Return Stripe publishable key | — | ✅ Returns `STRIPE_PUBLISHABLE_KEY` env var |
| | `POST /api/payment/setup-intent` | Create Stripe SetupIntent | — | ✅ Creates SetupIntent, returns `clientSecret` |
| | `POST /api/payment/save-payment-method` | Store Stripe payment method | PaymentMethods | ✅ Attaches PM to customer, upserts to DB, sets default |
| | `POST /api/payment/create-setup-session` | Stripe checkout setup session | — | ✅ Stripe checkout session with redirect URLs |
| | `DELETE /api/payment/payment-methods/:id` | Delete payment method | PaymentMethods | ✅ DB-delete with ownership check |

### AI Features

| Legacy Controller | Route | Business Logic | DB Tables | TS Coverage |
|-------------------|-------|---------------|-----------|-------------|
| **ChatController** | `POST /api/chat/message` | OpenRouter LLM with session + token tracking; AIRateLimit filter | AIUsageMetrics, AIChatSessions | ✅ `routes/ai.ts` `POST /api/ai/chat` |
| **SalaryCalculatorController** | `POST /api/salarycalculator/analyze` | Salary analysis with market data | — | ✅ `routes/salary.ts` |
| | `POST /api/salarycalculator/negotiation-tips` | Negotiation strategies | — | ✅ |
| | `GET /api/salarycalculator/locations` | Supported locations | — | ✅ |
| | `GET /api/salarycalculator/industries` | Supported industries | — | ❌ `/industries` endpoint not in TS API |
| **PromptController** | `POST /Prompt/summarize` | Summarize resume content | ResumeInformation | ✅ `POST /api/resumes/:id` summarize |
| | `POST /Prompt/match` | Match document to job | — | ✅ via `routes/match.ts` |
| | `POST /Prompt/parse` | Parse PDF to JSON | — | ✅ via `routes/resumes.ts` parse |
| **SentimentController** | sentiment analysis endpoints | ML.NET model inference | ResumeSentiment | ✅ `routes/sentiment.ts` (LLM-based) |
| **ValuePropositionController** | generate content endpoints | AI-generated value props | — | ✅ `routes/value-proposition.ts` |

### Dashboard & Admin

| Legacy Controller | Route | Business Logic | DB Tables | TS Coverage |
|-------------------|-------|---------------|-----------|-------------|
| **UserDashboardController** | `GET /api/userdashboard/jobseeker` | Role-specific metrics | JobApplications, SavedJobs | ✅ `routes/dashboard.ts` |
| | `GET /api/userdashboard/recruiter` | Recruiter metrics | TalentPools, Submissions | ✅ |
| | `GET /api/userdashboard/employer` | Employer metrics | Jobs, Applications | ✅ |
| | `POST /api/userdashboard/profile-view` | Track profile view | ProfileViews | ✅ |
| | `POST /api/userdashboard/activity` | Log user activity | ActivityLogs | ✅ |
| | `GET /api/userdashboard/engagement` | Engagement metrics | UserEngagementMetrics | ✅ |
| **ProductDashboardController** | `GET /api/productdashboard/saas-metrics` | MRR, churn, ARR | Subscriptions, Invoices | ⚠️ Admin routes exist; SaaS metrics calculation not confirmed — see Gap Register #39 |
| | `GET /api/productdashboard/time-series/:metric` | Time-series analytics | ActivityLogs | ⚠️ Not confirmed implemented — see Gap Register #39 |
| | `POST /api/productdashboard/refund-requests/:id/approve` | Admin approve refund | RefundRequests | ✅ `routes/admin.ts` |
| | `POST /api/productdashboard/cancellation-requests/:id/approve` | Admin approve cancellation | RefundRequests | ✅ |
| **AffiliateController** | `GET /api/affiliate/profile` | Affiliate profile | AffiliateProfiles | ✅ `routes/affiliates.ts` |
| | `GET /api/affiliate/dashboard` | Earnings, referrals | AffiliateReferrals, AffiliateConversions | ✅ |
| | `POST /api/affiliate/payout/request` | Request payout | AffiliatePayouts | ✅ |
| | Admin endpoints | All affiliate admin actions | AffiliateProfiles, AffiliatePayouts | ✅ |

### Settings, Password & Utilities

| Legacy Controller | Route | Business Logic | DB Tables | TS Coverage |
|-------------------|-------|---------------|-----------|-------------|
| **SettingsController** | All settings CRUD | Notification, privacy, job, account, security prefs | AccountPreferences, JobPreferences | ✅ `routes/settings.ts` |
| | `GET /api/settings/export` | GDPR data export | All user tables | ✅ Returns JSON bundle |
| **PasswordManagementController** | `GET /api/passwordmanagement/requirements` | Password policy | — | ✅ `routes/password-management.ts` |
| | `POST /api/passwordmanagement/validate-strength` | Strength check | — | ✅ |
| | `POST /api/passwordmanagement/validate-history` | Check against past passwords | PasswordHistory | ❌ Not implemented in TS API |
| | `GET /api/passwordmanagement/is-expired` | Check expiration | Users | ❌ Not implemented in TS API |
| | `POST /api/passwordmanagement/force-change` | Admin force reset | Users | ✅ |
| **TaskController** | Task CRUD | Create/update/delete tasks | Tasks | ✅ `routes/task.ts` |
| **UploadController** | File uploads | S3/R2 upload with validation | — | ✅ `routes/upload.ts` |
| **MarketingController** | `GET /api/marketing/campaigns` | Campaign listing | — | ⚠️ Stub in TS API — see Gap Register #38 |
| | `POST /api/marketing/leads` | Capture lead | — | ⚠️ Stub in TS API — see Gap Register #38 |
| **FeatureFlagController** | `GET /api/featureflag` | Feature flag states | — | ✅ `routes/featureflag.ts` (static) |
| **SearchController** | `GET /api/search/public` | Multi-entity search | ResumeInformation, Jobs, UserProfiles, CompanyProfiles | ✅ `routes/search.ts` |
| **YouTubeController** | YouTube OAuth + publish | YouTube API integration | YoutubeAccounts | ✅ `routes/youtube.ts` |
| **ExportController** | `GET /api/export/csv` | CSV export | — | ❌ Not implemented (TS export returns JSON only) |
| | `GET /api/export/excel` | Excel export via OpenXml | — | ❌ Not implemented |
| **ChromeController** | `POST /api/chrome/createjobbestmatch` | **DEPRECATED** (marked Obsolete) | — | ✅ Replaced by `/api/match/*` |
| **InterviewController** | Interview sessions CRUD | Session tracking, answer analysis | InterviewSessions, InterviewAnswers | ✅ `routes/interview.ts` |

### Coverage Summary

| Domain | Legacy Endpoints | TS Covered | Partial | Missing |
|--------|-----------------|------------|---------|---------|
| Auth & Account | ~25 | 23 | 0 | 2 (OData only) |
| Resume | ~30 | 27 | 1 | 2 (diff, bulk export) |
| Jobs & Matching | ~20 | 20 | 0 | 0 |
| Video & Studio | ~10 | 10 | 0 | 0 |
| Users & Social | ~20 | 19 | 1 | 0 |
| Companies | ~7 | 7 | 0 | 0 |
| Recruiter | ~15 | 12 | 0 | 3 (bulk ops, CSV export) |
| Communication | ~18 | 18 | 0 | 0 |
| Billing | ~10 | 8 | 1 | 3 (Stripe webhook/intent/save) |
| AI Features | ~20 | 18 | 0 | 2 (industries endpoint, AI rate limiter) |
| Dashboard & Admin | ~20 | 16 | 4 | 0 |
| Settings & Utilities | ~20 | 14 | 2 | 4 (password history, export CSV/xlsx, is-expired) |
| **Total** | **~215** | **~192 (89%)** | **~9 (4%)** | **~14 (7%)** |

### Can the legacy project be removed?

**Short answer: Not yet — Stripe is the blocker.**

The TypeScript API covers ~89% of the legacy surface area. All remaining legacy-parity gaps are tracked in the [Consolidated Gap Register](#consolidated-gap-register) (`legacy-parity` type). The Stripe blocker items below have since been resolved.

| Missing | Risk | Status |
|---------|------|--------|
| `POST /payment/stripe/webhook` | **🔴 High** | ✅ Implemented |
| `GET /payment/public-key` | **🔴 High** | ✅ Implemented |
| `POST /payment/setup-intent` | **🔴 High** | ✅ Implemented |
| `POST /payment/save-payment-method` | **🔴 High** | ✅ Implemented |
| `GET /api/export/csv` + `GET /api/export/excel` | 🟡 Medium | Open — see Gap Register #31 |
| Recruiter bulk ops (`bulk/tags`, `bulk/status`, `bulk/delete`) | 🟡 Medium | Open — see Gap Register #32 |
| `GET /api/recruiter/talent-pool/export` | 🟢 Low | Open — see Gap Register #33 |
| `POST /api/passwordmanagement/validate-history` | 🟢 Low | Open — see Gap Register #34 |
| `GET /api/passwordmanagement/is-expired` | 🟢 Low | Open — see Gap Register #35 |
| `GET /api/resume/:id/diff` | 🟢 Low | Open — see Gap Register #36 |
| Chrome extension endpoints (`ChromeController`) | ✅ None — marked `[Obsolete]` in legacy | Fully replaced by `/api/match/*` |
| OData endpoints (ApplicationUsers/Roles) | ✅ None | Not needed for edge runtime |

**Checklist to safely delete `/myvideoresume-api`:**

- [x] ✅ `GET /api/payment/public-key` — returns `STRIPE_PUBLISHABLE_KEY` env var
- [x] ✅ `POST /api/payment/setup-intent` — creates Stripe SetupIntent, returns `clientSecret`
- [x] ✅ `POST /api/payment/save-payment-method` — attaches PM to customer, upserts to DB, sets default
- [x] ✅ `POST /api/payment/stripe/webhook` — signature verified; handles `subscription.created/updated/deleted`, `invoice.payment_succeeded/failed`, `payment_method.attached/detached`, `payout.paid/failed`; records affiliate conversions
- [ ] (Optional) Add CSV serialisation to `/api/settings/export`

**The legacy project can now be safely deleted once Stripe secrets are configured.**

Configure secrets:
```bash
wrangler secret put STRIPE_PUBLISHABLE_KEY    # pk_live_...
wrangler secret put STRIPE_SECRET_KEY         # sk_live_...
wrangler secret put STRIPE_WEBHOOK_SIGNING_KEY # whsec_...
```

Register webhook in Stripe dashboard → Developers → Webhooks:
- **URL:** `https://api.hired.video/api/payment/stripe/webhook`
- **Events:** `customer.subscription.*`, `invoice.payment_succeeded`, `invoice.payment_failed`, `payment_method.attached`, `payment_method.detached`, `payout.paid`, `payout.failed`

---

## Payment Provider Abstraction

The payment layer uses a **Strategy Pattern** so the underlying provider (Stripe, Helcim, or future) can be swapped without touching route or business logic.

### Interface (`api/src/services/payment/types.ts`)

```typescript
interface PaymentProvider {
  name: string;
  getPublicKey(): string | null;
  getOrCreateCustomer(userId, email, name?): Promise<string>;
  createSetupSession(customerId, successUrl, cancelUrl): Promise<string>;
  initPaymentCollection(customerId, successUrl, cancelUrl): Promise<CollectPaymentMethodResult>;
  savePaymentMethod(customerId, providerPaymentMethodId, setDefault?): Promise<SavedPaymentMethod>;
  detachPaymentMethod(providerPaymentMethodId): Promise<void>;
  constructWebhookEvent(body, signature, secret): Promise<NormalizedWebhookPayload>;
}
```

### Implementations

| File | Provider | Status |
|------|----------|--------|
| `api/src/services/payment/stripe.ts` | Stripe | ✅ Full implementation |
| `api/src/services/payment/helcim.ts` | Helcim | ⚠️ Stub — API calls documented; card deletion unavailable via Helcim v2 API — see Gap Register #47 |

### Switching Providers

Set the `PAYMENT_PROVIDER` environment variable:

```bash
# Default — uses Stripe
wrangler secret put PAYMENT_PROVIDER   # stripe

# Switch to Helcim
wrangler secret put PAYMENT_PROVIDER   # helcim
wrangler secret put HELCIM_ACCOUNT_ID  # from Helcim dashboard → Settings → API
wrangler secret put HELCIM_API_TOKEN   # from Helcim dashboard → Settings → API
wrangler secret put HELCIM_WEBHOOK_TOKEN # from Helcim dashboard → Settings → Webhooks
```

Register Helcim webhook:
- **URL:** `https://api.hired.video/api/payment/webhook`
- **Events:** `transaction.approved`, `transaction.declined`, `recurring.payment.*`, `recurring.plan.*`

### Normalised Webhook Events

Provider-specific event strings are mapped to generic `NormalizedEventType` values consumed by `dispatchWebhookEvent()`:

| Generic type | Stripe event | Helcim event |
|-------------|-------------|-------------|
| `subscription.created` | `customer.subscription.created` | `recurring.plan.created` |
| `subscription.updated` | `customer.subscription.updated` | `recurring.plan.updated` |
| `subscription.deleted` | `customer.subscription.deleted` | `recurring.plan.cancelled` |
| `invoice.paid` | `invoice.payment_succeeded` | `transaction.approved` |
| `invoice.payment_failed` | `invoice.payment_failed` | `transaction.declined` |
| `payment_method.attached` | `payment_method.attached` | — |
| `payment_method.detached` | `payment_method.detached` | — |
| `payout.paid` | `payout.paid` | — |
| `payout.failed` | `payout.failed` | — |

---

## Getting Started

### Prerequisites

- **Node.js 18+**
- **npm**
- **Wrangler CLI** — `npm install -g wrangler`
- **Cloudflare account** with Workers enabled
- **Neon PostgreSQL** database

### Backend API Setup

```bash
cd api
npm install

# Configure local development secrets
cp wrangler.toml wrangler.dev.toml   # edit with your local values
# OR set environment variables directly

# Run database migrations
npm run db:push

# Start local development server (Node.js mode)
npm run dev

# Deploy to Cloudflare Workers
npm run deploy
```

#### Environment Variables / Secrets

Set via `wrangler secret put` for production, or in `wrangler.toml` `[vars]` for non-sensitive dev values:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` / `NEON_DATABASE_URL` | Yes | Neon PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret key for signing JWTs |
| `SENDPULSE_ID` / `SENDPULSE_SECRET` | Yes | SendPulse API credentials |
| `OPENROUTER_API_KEY` | Yes | OpenRouter API key for AI features |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Yes | S3-compatible storage credentials |
| `S3_BUCKET_NAME` / `S3_ENDPOINT` | Yes | Storage bucket configuration |
| `SENTRY_DSN` | No | Error monitoring |
| `FRONTEND_URL` | Yes | Comma-separated allowed CORS origins |
| `API_URL` | Yes (OAuth) | Public API base URL — used to build OAuth callback URLs |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth | Google OAuth 2.0 credentials |
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` | OAuth | LinkedIn OAuth credentials |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | OAuth | GitHub OAuth App credentials |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | OAuth | Azure AD app credentials |

#### CORS Configuration

Allowed origins are controlled by `FRONTEND_URL` in `wrangler.toml`. The value is read **inside the per-request origin callback** — this is intentional, as Cloudflare Worker bindings are unavailable at module-load time.

```toml
[vars]
FRONTEND_URL = "https://hired.video,https://www.hired.video"
```

#### Health Check

```
GET https://api.hired.video/api/health
```

Verifies the worker is running and the database connection is valid.

#### Database Migrations

```bash
cd api

# Apply schema changes
npm run db:push

# Generate migration files
npm run db:generate

# Open Drizzle Studio (visual DB browser)
npm run db:studio
```

#### OAuth Provider Setup

The API supports social login via Google, LinkedIn, GitHub, and Microsoft. Each provider requires creating an OAuth app and storing the credentials as Wrangler secrets.

**Callback URL pattern:** `https://api.hired.video/api/auth/oauth/{provider}/callback`

---

##### Google

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Credentials**
2. **Create credentials** → **OAuth 2.0 Client ID** → Application type: **Web application**
3. Under **Authorized redirect URIs**, add:
   ```
   https://api.hired.video/api/auth/oauth/google/callback
   http://localhost:8787/api/auth/oauth/google/callback   # local dev
   ```
4. Go to **OAuth consent screen** → set User Type to **External** → add scopes: `email`, `profile`, `openid`
5. While in test mode, add your own Google account as a test user
6. Copy **Client ID** and **Client Secret**

```bash
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
```

> **Gotcha:** The consent screen must be published (or your account added as a test user) before any login attempts work. "Access blocked" errors mean the consent screen isn't configured.

---

##### LinkedIn

1. Go to [LinkedIn Developer Portal](https://developer.linkedin.com/) → **Create app**
2. Fill in app name, company page, and logo (required)
3. Under **Auth** tab → **OAuth 2.0 settings** → add redirect URL:
   ```
   https://api.hired.video/api/auth/oauth/linkedin/callback
   ```
4. Under **Products** tab → request **Sign In with LinkedIn using OpenID Connect**
   - This unlocks the `openid`, `profile`, and `email` scopes — without it, login will fail
   - Approval is usually instant
5. Copy **Client ID** and **Client Secret** from the Auth tab

```bash
wrangler secret put LINKEDIN_CLIENT_ID
wrangler secret put LINKEDIN_CLIENT_SECRET
```

> **Gotcha:** You must add the "Sign In with LinkedIn using OpenID Connect" product — the basic API access does not grant the `email` scope.

---

##### GitHub

1. Go to [GitHub Settings → Developer settings → OAuth Apps](https://github.com/settings/developers) → **New OAuth App**
2. Set:
   - **Application name:** hired.video
   - **Homepage URL:** `https://hired.video`
   - **Authorization callback URL:** `https://api.hired.video/api/auth/oauth/github/callback`
3. Click **Register application**, then **Generate a new client secret**

```bash
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
```

> **Gotcha:** GitHub OAuth Apps only support a single callback URL. For local dev, either create a separate "hired.video (dev)" OAuth App or temporarily update the callback URL while developing.

---

##### Microsoft

1. Go to [Azure Portal](https://portal.azure.com/) → **Microsoft Entra ID** → **App registrations** → **New registration**
2. Set:
   - **Name:** hired.video
   - **Supported account types:** Accounts in any organizational directory and personal Microsoft accounts
   - **Redirect URI:** Web → `https://api.hired.video/api/auth/oauth/microsoft/callback`
3. After registration, go to **Certificates & secrets** → **New client secret** → copy the value immediately
4. Copy the **Application (client) ID** from the Overview page

```bash
wrangler secret put MICROSOFT_CLIENT_ID
wrangler secret put MICROSOFT_CLIENT_SECRET
```

---

##### API_URL Secret

All OAuth callback URLs are built from `API_URL` at runtime. Set it alongside the other secrets:

```bash
wrangler secret put API_URL   # value: https://api.hired.video
```

---

##### Local Development

Create `api/.dev.vars` (gitignored) with all secrets for local dev:

```ini
DATABASE_URL=postgresql://...
JWT_SECRET=your-local-secret-min-32-chars

# OAuth
API_URL=http://localhost:8787
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
LINKEDIN_CLIENT_ID=...
LINKEDIN_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...
```

Wrangler automatically loads `.dev.vars` when running `npm run dev`.

---

##### Provider Summary

| Provider | Setup time | Notable gotcha |
|----------|-----------|----------------|
| GitHub | ~2 min | Single callback URL per app — create a separate dev app |
| Google | ~5 min | Must configure OAuth consent screen and add test users |
| LinkedIn | ~5 min | Must request "Sign In with LinkedIn using OpenID Connect" product |
| Microsoft | ~10 min | Azure Portal UX is complex; choose "any org + personal accounts" |

### Frontend Setup

```bash
cd frontend
npm install

# Create environment file
cp .env.example .env
```

**`.env` configuration:**

```env
VITE_API_URL=https://api.hired.video/api
VITE_OPENROUTER_API_KEY=your_openrouter_key
VITE_APP_NAME=hired.video
VITE_GTM_ID=GTM-T6CSJ22D
```

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Type checking
npm run typecheck
```

### Chrome Extension Setup

The Chrome extension lives in `hiredvideo-chrome-extension/` and works as a side panel companion for job seekers.

**Features:**
- **Score & Evaluate** — parses the current page's job description and calls `POST /api/match/analyze` to score the user's resume against it
- **Tailor & Generate** — calls `POST /api/match/tailor` to rewrite the resume as markdown; displays score improvement
- **Save as Variation** — sends the tailored markdown to `POST /api/resume/:id/createvariation`
- **Download** — exports via `GET /api/resume/:id/export?format=md|json`
- **Resume selection** — loads available resumes from `GET /api/resume/mastergroups`
- **Login** — authenticates via `POST /api/auth/login`, stores JWT in `chrome.storage.local`

**Supported job sites** (site-specific CSS selectors): LinkedIn, Indeed, Glassdoor, ZipRecruiter, Monster, CareerBuilder, Dice, Lever, Greenhouse, Workday, AngelList/Wellfound, and more. Falls back to JSON-LD structured data extraction, then generic selectors.

**Load the extension (development):**

```bash
# No build step required — plain JS/HTML/CSS
# 1. Open Chrome → chrome://extensions
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select the hiredvideo-chrome-extension/ directory
```

**Configuration:**

The extension's `constants.js` file controls the API endpoint. Set `isDevelopment = true` to point to `http://localhost:5000` for local API development.

| File | Purpose |
|------|---------|
| `manifest.json` | Extension manifest (Manifest V3) |
| `constants.js` | API base URLs, endpoint constants, job site parsers |
| `service-worker.js` | Background service worker; opens side panel on extension icon click |
| `content-script.js` | Injected into all pages; captures page HTML and URL |
| `sidepanel-global.html` | Main side panel UI |
| `login.html` | Login form |
| `sidepanel.js` | Side panel logic (API calls, UI state) |
| `login.js` | Login form handler |

### VS Code Recommended Extensions

- **ESLint** — Linting
- **Prettier** — Formatting
- **Tailwind CSS IntelliSense** — TailwindCSS support
- **Drizzle ORM** — Schema navigation
- **Thunder Client** — API testing
- **GitLens** — Git history

---

## Deployment

The API is deployed as a Cloudflare Worker. The deploy script runs migrations before deploying:

```bash
cd api
npm run deploy
# Runs: db:push → wrangler deploy --env production
```

The frontend is a static SPA deployable to any CDN (Cloudflare Pages, Vercel, Netlify).

---

## Known Issues & Priorities

Open gaps, the full product roadmap, and implementation status are tracked in the [Consolidated Gap Register](#consolidated-gap-register) below.

---

## Strategic Moats

| Moat | What it is |
|---|---|
| **Data** | Resumes, jobs, interactions, videos, match scores — proprietary training signal |
| **AI** | Scoring, matching, tailoring, mock interviews, sentiment — keeps improving with usage |
| **Network** | Candidates + recruiters + companies on one platform — liquidity begets liquidity |

Lean into distribution (Chrome extension + shareable links), automation (autonomous agent), and network effects (marketplace) to compound all three.

---

## Consolidated Gap Register

Single source of truth for all implementation status, product roadmap phases, and priorities — including feature gaps, quality gaps, and architecture/cross-cutting concerns. Sorted by P0 → P4 (revenue impact).

**Current totals: 118 Done · 27 Open · 145 Total**

**Phases:** `Now` = 0–30 days · `Soon` = 30–60 days · `Mid` = 60–120 days · `Later` = 6–12 months

**Types:** `billing` = revenue enforcement · `feature` = product capability · `arch` = architecture · `quality` = code quality · `legacy` = legacy parity

**Positioning:** *"LinkedIn + Loom + ATS + AI Copilot — in one platform"*

| # | Status | Phase | Priority | Type | Gap | Notes |
|---|--------|-------|----------|------|-----|-------|
| 21 | ✅ Done | Now | P0 | `billing` | **Subscription tier enforcement** | `checkAIUsage` added to `value-proposition.ts` (4 endpoints) and `POST /api/ai/context`. `resume-scorer`, `resume-optimizer`, `salary.ts`, `match.ts` already gated. `checkTeamSize` on invite creation. |
| 22 | ✅ Done | Now | P0 | `billing` | **Salary calculator gated to Premium** | `POST /analyze` and `POST /negotiation-tips` guarded by `requirePremium`. `GET /industries` intentionally public. |
| 23 | ✅ Done | Now | P0 | `billing` | **AI message personalisation tiers** | `POST /api/messages/personalize` — template for free, LLM for Premium, AI usage recorded. |
| 24 | ✅ Done | Now | P0 | `billing` | **Priority / AI-enhanced job matching** | `POST /api/match/insights` (Premium) — skill gaps, career trajectory, interview tips, ramp time. |
| 25 | ✅ Done | Now | P0 | `billing` | **Team size / admin user limits** | `checkTeamSize()` called on `POST /api/account/invite`. Free accounts blocked at `FREE_TEAM_MEMBER_LIMIT`. |
| 26 | ✅ Done | Now | P0 | `billing` | **Advanced video templates** | `GET /api/studio/templates` — 3 free (720p) + 5 Premium (1080p). |
| 49 | ✅ Done | Now | P0 | `billing` | **Ad-free enforcement for Premium** | `GET /api/ads/config` returns `{ adsEnabled: false }` for Premium users. Frontend suppresses all ad slots on this flag. |
| 47 | ✅ Done | Soon | P0 | `quality` | **Helcim payment provider** | `services/payment/helcim.ts` — full Helcim API v2 integration, OAuth token caching, HMAC-SHA256 webhook verification, HelcimPay.js card tokenization. Needs `HELCIM_ACCOUNT_ID` + `HELCIM_API_TOKEN` secrets. |
| 55 | ✅ Done | Now | P0 | `billing` | **In-product upgrade prompts + usage meters** | `GET /api/billing/usage-summary` returns AI usage, team seat count, feature availability flags. Frontend consumes to show paywalls and progress meters. |
| 56 | ✅ Done | Now | P0 | `billing` | **Annual billing option (20% discount)** | `POST /api/billing/subscribe` with `interval: yearly` applies `priceYearly` from plan (20% off). Creates subscription with 365-day period + invoice. |
| 57 | ✅ Done | Now | P0 | `billing` | **Trial period (14 days)** | `POST /api/billing/trial/start` creates `status=trialing` subscription + trial notification. `getSubscription` treats `trialing` as Premium. One trial per user enforced. |
| 58 | ✅ Done | Now | P0 | `billing` | **Churn / cancellation flow** | `POST /api/billing/pause` (30-day pause), `POST /api/billing/downgrade` (drop to free). Enhanced cancel route shows retention options. |
| 40 | ✅ Done | Now | P1 | `feature` | **Shareable "Hire Me" public profiles** | `GET /api/users/:id` returns profile + `publicVideos[]` + `publicResumeCount`. Visibility-conditional. Each profile = free SEO page + viral loop. |
| 43 | ✅ Done | Now | P1 | `feature` | **Magic links (passwordless login)** | `POST /api/auth/magic-link` + `GET /verify?token=` — 32-byte token, 15-min expiry, issues JWT. |
| 45 | ✅ Done | Now | P1 | `quality` | **Direct messaging complete** | `GET /inbox`, `POST /conversations`, `GET /conversations/:id`, send + read receipts. |
| 54 | ✅ Done | Now | P1 | `feature` | **AI visitor/prospect chat widget** | `POST /api/chat/visitor` (public) — LLM FAQ bot with email lead capture into `marketingLeads`. Static fallback if no API key. Zero external scripts. |
| 42 | ✅ Done | Now | P1 | `feature` | **OAuth / Social Login (Google + LinkedIn)** | Backend fully implemented in `oauthRoutes` (`PROVIDERS` map). Needs `GOOGLE_CLIENT_ID/SECRET` + `LINKEDIN_CLIENT_ID/SECRET` as Cloudflare secrets. Zero code changes required. |
| 9  | ✅ Done | Now | P1 | `feature` | **LinkedIn OAuth full flow** | `linkedin` provider in `PROVIDERS` map — OIDC flow, profile import on sign-up. Needs `LINKEDIN_CLIENT_ID/SECRET` env vars. Zero code changes required. |
| 61 | ✅ Done | Now | P1 | `billing` | **Referral programme UI** | `ReferralBanner` component added to `DashboardWrapper` — shown to all authenticated users. Fetches referral code from `affiliateService.getProfile()`, shows copy-link button, dismissable via localStorage. Links to `/affiliate-program` for full details. |
| 62 | ✅ Done | Now | P1 | `billing` | **In-app billing event notifications** | `GET /api/billing/notifications` returns alerts: trial ending (≤3 days), cancellation scheduled, AI usage ≥90%. Frontend polls this to show banners. |
| 48 | ✅ Done | Now | P1 | `feature` | **Ad slot components — free tier** | `AdSlot` component placed in `Dashboard` (dashboard-banner) and `Jobs` (jobs-banner). Component renders nothing for Premium users; dev placeholder when slot IDs missing. |
| 59 | ✅ Done | Soon | P1 | `billing` | **Freemium activation / onboarding email drip** | `lib/onboardingDrip.ts` auto-creates 3-step sequence and enrolls user on register (`waitUntil`). Cron in `scheduled.ts` delivers emails at day 0/3/7. |
| 60 | ✅ Done | Soon | P1 | `feature` | **Resume/profile AI score free preview** | `/api/resume-scorer/score` now returns `overallScore + grade` free; full breakdown (ATS, keyword, categories, recommendations) Premium-only. |
| 41 | 🔲 Open | Mid | P1 | `feature` | **Real-time chat (recruiter ↔ candidate)** | REST message layer done (#45). Remaining: WebSocket transport via Cloudflare Durable Objects or Pusher — infrastructure + frontend. |
| 68 | ✅ Done | Mid | P1 | `feature` | **GitHub + Microsoft OAuth** | `github` + `microsoft` providers in `PROVIDERS` map (`oauth.ts`). GitHub fetches primary verified email from `/user/emails`. Microsoft uses Graph API. Needs `GITHUB_CLIENT_ID/SECRET` + `MICROSOFT_CLIENT_ID/SECRET` env vars. Zero code changes required. |
| 69 | ✅ Done | Mid | P1 | `feature` | **"Apply with hired.video" embeddable button** | `GET /api/apply-button/snippet` — returns self-contained JS that replaces `[data-hired-apply]` elements with branded purple buttons. `POST /api/apply-button/track` — lead capture (email + jobId) + redirect to signup. `GET /api/apply-button/:jobId/meta` — job metadata for button label. All routes public. Employers paste one `<script>` tag. |
| 70 | ✅ Done | Mid | P1 | `feature` | **Boolean / advanced recruiter search** | `POST /api/search/recruiter` — Boolean query parser (`AND`/`OR`/`NOT`/quoted phrases → PostgreSQL `tsquery`), skill filters, location, experience level. `GET/POST/DELETE /api/search/saved` — saved searches CRUD. `savedSearches` table added to `recruiter.ts` schema. |
| 17 | ✅ Done | Mid | P2 | `feature` | **Time-to-hire analytics** | `GET /api/analytics/time-to-hire` (Premium) — avg days to placement, per-job breakdown, monthly trend from `placements`. |
| 27 | ✅ Done | Mid | P2 | `billing` | **Advanced dashboard analytics + AI insights** | `POST /api/dashboard/ai-insights` (Premium + AI usage gated) — 30-day funnel metrics → LLM narrative insights, recommendations, risk flags. |
| 30 | ✅ Done | Mid | P2 | `billing` | **AI-powered smart notifications** | `GET /api/notifications/smart` (Premium) — scored by type weight + recency + unread bonus. |
| 38 | ✅ Done | Now | P2 | `quality` | **Marketing routes (campaigns + leads)** | `GET/POST /api/marketing/campaigns` + `/leads`, wired to real DB tables. |
| 39 | ✅ Done | Now | P2 | `quality` | **ProductDashboard SaaS metrics** | `GET /api/admin/` — real MRR/ARR/ARPU from DB. Time-series + standalone SaaS metrics endpoints. |
| 44 | ✅ Done | Soon | P2 | `feature` | **Security settings — active sessions** | `GET /api/settings/security/sessions` + `DELETE /:id` — refresh token session management. |
| 46 | ✅ Done | Now | P2 | `quality` | **Avatar upload validation** | `POST /api/users/me/avatar` — 5MB cap, jpg/png/gif/webp only, saves to `userProfiles.avatarUrl`. |
| 50 | ✅ Done | Mid | P2 | `feature` | **Sponsored job listings** | `sponsored`, `sponsoredUntil`, `sponsoredRankBoost` added to `jobItems` schema. Employers pay for top placement. |
| 51 | ✅ Done | Mid | P2 | `feature` | **Featured candidate profiles** | `featuredUntil` added to `userProfiles` schema. Job seekers pay one-off fee via Stripe. |
| 84 | ✅ Done | Now | P2 | `feature` | **API key management** | `schema/apikeys.ts` — prefix + SHA-256 hash; key shown once at creation. `GET/POST /api/apikeys`, `DELETE/PATCH /api/apikeys/:id`. |
| 85 | ✅ Done | Mid | P2 | `feature` | **Career progress tracking (job seekers)** | `GET /api/dashboard/career-progress` (Premium) — monthly application trend + interview practice scores. |
| 10 | ✅ Done | Mid | P2 | `feature` | **Full-text / faceted search** | `plainto_tsquery` full-text search added to `getPublicJobs` (title + description + company). All facet filters live. Add GIN index on `to_tsvector(...)` for scale. |
| 11 | ✅ Done | Mid | P2 | `feature` | **Calendar integration (Google / Outlook)** | `GET /api/calendar/connect/:provider` (Google/Outlook OAuth with `calendar.events` scope). `GET /api/calendar/connect/:provider/callback` (public, stores tokens). `POST /api/calendar/sync` — two-way sync: pushes unsynced platform events to Google Calendar API, marks `syncedToCalendar=true`. Refresh token stored in `calendarConnections`. |
| 13 | ✅ Done | Mid | P2 | `feature` | **Hiring & onboarding — offer letters, e-signature** | `POST /api/hiring/offers/:id/send-for-signature` (Premium) — creates Dropbox Sign embedded signature request, returns `signatureRequestId` + `signingUrl`. `POST /api/hiring/offers/webhook/dropbox-sign` (public) — HMAC-verified, marks offer `signed` on `signature_request_signed` event. Stubs gracefully if `DROPBOX_SIGN_API_KEY` absent. |
| 14 | ✅ Done | Mid | P2 | `feature` | **Performance management — OKR, reviews** | `PATCH /api/performance/goals/:id/progress` added (key results as JSONB, auto-complete at 100%). `PATCH /api/performance/reviews/:id/acknowledge` for employee sign-off. |
| 15 | ✅ Done | Mid | P2 | `feature` | **Automated outreach follow-ups** | `scheduled.ts` + `worker.ts` `scheduled()` export added. Cron processes due `followUpEnrollments`, sends email via provider, advances steps, marks complete. |
| 16 | ✅ Done | Mid | P2 | `feature` | **Hiring success metrics** | `GET /api/analytics/hiring-metrics` added with per-role pipeline conversion. Fully tracked from `jobApplications` + `placements`. |
| 19 | ✅ Done | Mid | P2 | `feature` | **Employer internal community — notifications** | `notifications` bulk-insert added on community post creation; notifies all company members except poster. Fire-and-forget. |
| 20 | ✅ Done | Mid | P2 | `feature` | **Exclusive job boards + bidding** | `PATCH /bids/:id/accept` (admin) activates job posting, notifies bidder. `PATCH /bids/:id/reject` with reason. Auction loop complete. |
| 28 | ✅ Done | Mid | P2 | `billing` | **Advanced interview scheduling + automation** | `POST /api/calendar/interview-slots` — reads recruiter availability windows + proposes open slots for next N days (default business hours fallback). `POST /api/calendar/book-interview` — creates `scheduledEvents` record, fires calendar sync, notifies candidate via `notifications`. |
| 29 | ✅ Done | Mid | P2 | `billing` | **Smart outreach campaigns** | `POST /api/followups/trigger` added — resolves sequence by ID/name/trigger-name, deduplicates active enrollments, computes `nextSendAt` from first step delay. |
| 63 | ✅ Done | Mid | P2 | `feature` | **Employer branding pages** | `employerBrandingPages` schema: hero video URL, headline/subtitle, culture statement, values, perks, media gallery, team highlights, awards, brand colour, `isPublished`. `GET /api/companies/:id/branding` (public). `PATCH /api/companies/:id/branding` (owner only, upsert). |
| 64 | ✅ Done | Mid | P2 | `feature` | **ATS integrations (Greenhouse, Lever, Workday)** | `atsConnections` schema (provider, apiKey, webhookSecret, config, lastSyncAt). `GET/POST/DELETE /api/ats/connections` (company owner only). `POST /api/ats/sync/:connectionId` — pulls candidates from provider (stub + real path). `POST /api/ats/webhook/:provider` (public) — HMAC-verified inbound events from Greenhouse/Lever/Workday. |
| 65 | ✅ Done | Mid | P2 | `feature` | **Passkeys / WebAuthn** | `webauthnCredentials` + `webauthnChallenges` schema. Full FIDO2/ES256 flow via Web Crypto API (no external deps). `POST /api/auth/passkey/register/begin|complete`, `POST /api/auth/passkey/login/begin|complete`, `GET/DELETE /api/auth/passkey/credentials`. CBOR authData parsing, DER→raw sig conversion, rpIdHash verification, signCount clone detection, JWT issuance on success. |
| 66 | ✅ Done | Mid | P2 | `feature` | **AI Recruiter Agent** | `recruiterAgentRuns` schema. `POST /api/recruiter/agent/source` — keyword-matches candidates from resumes DB, LLM scores each (0-100) + generates personalised outreach draft, returns ranked results. `GET /api/recruiter/agent/runs` + `/:id` — run history. Heuristic fallback if no API key. |
| 67 | ✅ Done | Mid | P2 | `billing` | **Employer seat-based billing** | `companySubscriptions` schema (planTier, seatCount, pricePerSeatCents, Stripe fields). `GET /api/billing/company/:id` — plan + seat usage vs. capacity. `PATCH /api/billing/company/:id/seats` — add/remove seats (starter $49/seat, team $39/seat, enterprise $29/seat). Upsert with monthly period tracking. |
| 79 | ✅ Done | Later | P2 | `feature` | **University / bootcamp partnerships** | `tenantType: "university"|"bootcamp"` in `whitelabelTenants`. `GET /api/whitelabel/tenants/:id/analytics` — placement rate, avg salary, active job listings (filtered by tenant). |
| 80 | ✅ Done | Later | P2 | `feature` | **B2B sales motion (agencies, staffing firms)** | `POST /api/whitelabel/demo-request` (public) — lead capture into `marketingLeads`. `GET /api/whitelabel/roi-calculator` — ROI estimate based on team size + placements/month (35% placement lift, 40% faster time-to-fill). |
| 6  | ✅ Done | Now | P3 | `arch` | **Structured logging** | `src/lib/logger.ts` — newline-delimited JSON to stdout for Cloudflare Logpush / tail workers. Wired into `app.onError`. |
| 7  | ✅ Done | Now | P3 | `arch` | **Dynamic feature flags** | DB-backed flags with per-user rollout %. `GET/PATCH /api/featureflag/:key`. 6 default flags seeded. |
| 31 | ✅ Done | Now | P3 | `legacy` | **CSV / Excel export** | `GET /api/settings/export?format=csv`. Legacy `/api/export/csv` + `/excel` redirect. |
| 32 | ✅ Done | Now | P3 | `legacy` | **Recruiter bulk operations** | `POST /api/recruiter/bulk/tags`, `/bulk/status`, `DELETE /bulk/delete`. |
| 33 | ✅ Done | Now | P3 | `legacy` | **Recruiter talent-pool export** | `GET /api/recruiter/talent-pool/export` — RFC 4180 CSV download. |
| 34 | ✅ Done | Now | P3 | `legacy` | **Password history validation** | `POST /api/passwordmanagement/validate-history` — PBKDF2 re-verify last 5 hashes. |
| 35 | ✅ Done | Now | P3 | `legacy` | **Password expiry check** | `GET /api/passwordmanagement/is-expired` — 90-day expiry, returns `{ isExpired, daysUntilExpiry }`. |
| 36 | ✅ Done | Now | P3 | `legacy` | **Resume diff / variation compare** | `GET /api/resumes/:id/diff?compareId=` — field-level diff + summary counts. |
| 37 | ✅ Done | Now | P3 | `legacy` | **Salary calculator `/industries` endpoint** | `GET /api/salarycalculator/industries` — 16 industries with subcategories. |
| 52 | ✅ Done | Now | P3 | `quality` | **Ad revenue reporting** | Impressions and clicks tracked via `POST /api/analytics/ads/impression`. Aggregated under `adMetrics` in `GET /api/analytics/usage`. |
| 53 | ✅ Done | Now | P3 | `quality` | **Feature adoption, usage analytics, click beacon** | `POST /api/analytics/beacon` (public) → `activityLogs`. `GET /api/analytics/usage` — DAU/WAU/MAU, top endpoints, error rate, ad CTR. |
| 3  | ✅ Done | Mid | P3 | `arch` | **Background job workers** | `scheduled.ts` processes `queueJobToProcess` pending items (retry with backoff, `send_email` dispatcher). `worker.ts` exports `scheduled()` for Cloudflare Cron Triggers. |
| 8  | ✅ Done | Mid | P3 | `arch` | **Caching layer** | `getSubscription()` now has 60s in-process Map cache + Cloudflare KV (`KV_CACHE` binding) for cross-instance caching. `invalidateSubscriptionCache()` called on all mutations. |
| 71 | ✅ Done | Mid | P3 | `feature` | **AI career copilot ("What should I do next?")** | `POST /api/dashboard/career-copilot` implemented — Premium + AI usage gated. Pulls last-30-day application + interview data, calls LLM to generate: `summary`, `actionItems` (4-5 tasks), `skillGaps`, `marketSignals`, `wins`, `nextReviewDate`. Static fallback if no API key. |
| 72 | ✅ Done | Mid | P3 | `feature` | **"Resume Roast" viral engine** | `ResumeRoast.tsx` now has three share actions after roast completes: (1) "Share on LinkedIn" — opens LinkedIn share intent with auto-generated post copy (score, strength, fix, hashtags); (2) "Post to Feed" (authenticated users) — creates a public Feed post with roast summary; (3) existing "Download Card" PNG. |
| 73 | ✅ Done | Mid | P3 | `feature` | **AI Mock Interview → pre-qualified candidates** | `POST /api/interview/sessions/:id/share` — generates a unique `shareToken`, marks session `isShared=true`, returns a public URL `/interview/shared/:token`. `GET /api/interview/public/:shareToken` — public endpoint (no auth) returning sanitised session summary: score, question count, per-question score + feedback. Schema: `shareToken` + `isShared` added to `interviewSessions`. |
| 74 | ✅ Done | Mid | P3 | `feature` | **Affiliate program scaling** | `affiliateTiers` schema (Bronze 10%→Silver 15%→Gold 20%→Platinum 25% + recruiter bonuses). `affiliateLinkClicks` per-click tracking table. Rebuilt `affiliates.ts` with real DB: profile auto-create, tier calculation, click tracking `POST /click` (public), leaderboard, payout request ($50 min). |
| 75 | ✅ Done | Later | P3 | `feature` | **White-label / agency tier** | `whitelabelTenants` schema (subdomain, branding, planTier, customDomain). `GET/POST /api/whitelabel/tenants`, `PATCH /api/whitelabel/tenants/:id`. `GET /api/whitelabel/portal/:subdomain` (public branding). ROI calculator `GET /api/whitelabel/roi-calculator`. |
| 76 | ✅ Done | Later | P3 | `feature` | **Candidate assessments / skills tests** | `skillAssessments` + `assessmentAttempts` schema. `GET /api/assessments` (public browse), `POST /:slug/start` (timed attempt), `POST /attempts/:id/submit` (AI grading for short-answer/code, auto-grade MC). Badge display `GET /users/:id/badges` (public). AI feedback via LLM. |
| 77 | ✅ Done | Later | P3 | `feature` | **Autonomous job application agent** | `POST /api/auto-apply/start` (Premium) — LLM tailors cover letter + resume summary per job, optionally auto-submits to `jobApplications`. `GET /api/auto-apply/matches` — AI-ranked job matches from active listings (LLM scoring when API key available, heuristic fallback). |
| 78 | ✅ Done | Later | P3 | `feature` | **TikTok-style talent discovery feed** | `GET /api/discovery/talent-feed` — algorithmic candidate surfacing with video boost scoring, skill + location filters, cursor pagination. `GET /api/discovery/talent-feed/:userId` — single candidate card. |
| 81 | ✅ Done | Later | P3 | `feature` | **SEO content engine** | `GET /api/discovery/seo/resume-guide/:jobSlug` — AI-generated resume guide (skills, tips, mistakes, salary range) with 24h CDN cache. `GET /api/discovery/seo/salary/:jobSlug` — real salary data from job listings + LLM insights. Public routes. |
| 82 | ✅ Done | Later | P3 | `feature` | **Creator / influencer mode** | `GET /api/discovery/creators/leaderboard` — top creators by post count. `POST/GET /api/discovery/creators/products` — list and browse career products/resume templates for sale (stub `creatorProducts` table with `marketingLeads` fallback). |
| 83 | ✅ Done | Later | P3 | `feature` | **Smart job board layer** | `GET /api/discovery/jobs` — NL query + location + remote filter, TF-IDF relevance scoring + sponsored boost, returns ranked results. `GET /api/discovery/jobs/:id/similar` — "More like this" via title keyword matching. |
| 1  | 🔲 Open | Later | P4 | `arch` | **No automated tests** | Vitest + `@cloudflare/vitest-pool-workers`. `createApp()` is a pure function — testable without mocking the Worker runtime. |
| 2  | ✅ Done | Soon | P4 | `arch` | **No OpenAPI / Swagger** | `GET /api/openapi.json` — OpenAPI 3.1 spec covering all major endpoints (auth, jobs, recruiter, ATS, billing, assessments, auto-apply, discovery, passkeys, whitelabel). `GET /api/docs` — redirects to Swagger UI. Served as public static JSON with 1h CDN cache. |
| 4  | 🔲 Open | Later | P4 | `quality` | **Business logic in route handlers** | Refactor inline DB queries into `services/`. Pattern established in `services/billing.ts`, `services/account.ts`. |
| 5  | 🔲 Open | Later | P4 | `arch` | **No repository abstraction** | Low ROI given Drizzle's design. Revisit if test mocking becomes the driver. |
| 86 | ✅ Done | Mid | P2 | `feature` | **Job board scraper / extraction engine** | `jobBoardSources` + `jobBoardSyncLog` schema. Admin CRUD at `/api/admin/job-sources` + manual sync trigger. User CRUD at `/api/job-sources`. RSS + JSON API parser, SHA-256 dedup on `sourceUrl`. `scrapeAllActiveSources()` wired into cron. |
| 87 | ✅ Done | Now | P1 | `feature` | **Studio as advertising tool — 12 improvements** | (1) `purpose` field on storyboard generation (`resume`/`job_ad`/`company_promo`/`recruiter_brand`/`product_launch`). (2) Expanded scene types: `job-details`, `company-culture`, `cta`, `testimonial`, `product-feature`, `brand-story`, `requirements`, `benefits`. (3) Purpose-specific AI prompts + mock scripts. (4) CTA scene fields (`ctaUrl`, `ctaText`, `ctaQrCode`). (5) Logo overlay on video/scenes. (6) Brand kit CRUD (`studioBrandKits` table, `/api/studio/brand-kits`). (7) Clone project (`POST /api/studio/projects/:id/clone`). (8) Video analytics — view + CTA-click tracking (`videoAnalytics` table, `/api/studio/videos/:id/view`, `/cta-click`, `/analytics`). (9) Embed code generation (`GET /api/studio/videos/:id/embed`). (10) Campaign management (`videoCampaigns` table, `/api/studio/campaigns` CRUD + `/stats`). (11) Ad-specific template library (`GET /api/studio/ad-templates`). (12) Brand kit injection into AI-generated scripts. |
| 88 | ✅ Done | Now | P1 | `feature` | **Marketing pages for all sidebar nav routes** | Review revealed: `/feed` had no marketing page (just a "sign in" prompt); `/tasks` had a minimal hero-only section. Both pages now have full marketing landings matching the pattern of `/dashboard`, `/studio`, `/interview`, `/outreach`, `/resumes`. Feed landing covers post types (career updates, job shares, resume shares, insights, questions), hashtag discovery, privacy controls, and engagement. Tasks landing covers calendar/timeline view, role-specific task types (job seeker vs recruiter workflows), and progress tracking with feature cards. |
| 89 | ✅ Done | Now | P1 | `feature` | **Video & resume analytics frontend** | `GET /api/studio/projects` now returns `viewCount` + `ctaClickCount` per project by joining `videoAnalytics`. `StudioProject` schema extended. `StudioSidebar` project list shows eye icon + view count when > 0. Remaining: heatmap visualization, recruiter-facing "who viewed your resume" page. |
| 90 | ✅ Done | Now | P1 | `feature` | **Social Feed backend** | Feed backend complete with 13 endpoints. Added: auto-extract hashtags + mentions from post content on create/update (stored in `tags` JSONB). `GET /api/feed/posts?tag=:hashtag` filter. `GET /api/feed/trending-tags` returns top hashtags by frequency (last 30 days). `@mention` notifications fire-and-forget via `notifications` table on post creation. Remaining: algorithmic ranking, real-time push. |
| 91 | ✅ Done | Now | P2 | `feature` | **AI Coach / Career Copilot discoverability** | Added "AI Coach" entry (Brain icon, `/chat`) to `Sidebar.tsx` navigation between Interview Practice and Jobs. Page already had full marketing landing + auto-open chat panel. |
| 92 | ✅ Done | Now | P2 | `feature` | **LinkedIn post generator discoverability** | Studio marketing landing updated: "Share Everywhere" feature card expanded with explicit mention of AI LinkedIn post generator (hook, caption, hashtags, one-click intent). New "LinkedIn Post AI" card added to "Built for Advertising" section (4-card grid). |
| 93 | ✅ Done | Now | P1 | `feature` | **AI CHRO homepage redesign** | Replaced `HeroCarousel` with an AI CHRO hero section on `Index.tsx`: branded "AI Chief Human Resources Officer" pill badge, large headline, prominent `Textarea` prompt, "Ask CHRO" button (navigates to `/ai-coach?q=...`), and 5 quick-action chips (resume optimization, job description, candidate sourcing, salary benchmarking, interview prep). `AICoach.tsx` reads `?q=` param via `useSearchParams` and calls `openAIWithContext` to pre-populate the chat panel. `AIChatPanel.tsx` system prompt rewritten to full CHRO persona (talent acquisition, workforce strategy, HR analytics, employer branding, compliance). Welcome messages updated for all user roles. Panel header renamed "AI CHRO". |
| 94 | ✅ Done | Soon | P0 | `billing` | **AI credit add-on packs + model tier unlocks** | `enrichmentCredits` + `enrichmentTransactions` tables in `advertising.ts` schema. Credit ledger with `totalPurchased`, `totalConsumed`, `balance` tracking. Transaction types: `purchase`, `deduction`, `refund`, `monthly_grant`. Pack purchasing with balance checks in `advertising.ts` routes. |
| 95 | ✅ Done | Soon | P1 | `feature` | **Email delivery (SendPulse)** | `services/email.ts` — `EmailProvider` interface with `SendPulseEmailProvider` implementation. OAuth2 token caching. Templates: verification, password reset, 2FA, team invitations, magic links. Used by `auth.ts`, `account.ts`, `onboardingDrip.ts`. Outreach sequences delivered via `followUpSequences` engine in `scheduled.ts` cron. Remaining: custom sending domains (SPF/DKIM provisioning), bounce webhooks. |
| 96 | 🔲 Open | Mid | P1 | `billing` | **Contact enrichment credits (Apollo/ZoomInfo replacement)** | Enrichment credit add-on packs (25 included/mo on Pro; packs: 100/$9.95, 500/$39.95, 1,000/$69.95). Backend integration with a data provider (PeopleDataLabs, Hunter.io, or Apollo API). "Enrich" action on talent pool entries and external contacts: populates verified email, direct phone, LinkedIn URL, current company/title. Credit deducted per successful enrichment only. Balance ledger using same pattern as `phone_balances`. Free tier: 0 included. Replaces Apollo data tier ($49–$99/user/mo). Highest-value B2B add-on — recruiters and SDRs live in enrichment tools. |
| 97 | ✅ Done | Mid | P1 | `feature` | **Business Phone Phase 2 — user dashboard** | `PhoneDashboardPage.tsx` for authenticated Pro users: usage meters (voice minutes, SMS, MMS progress bars with 80%/100% colour shifts), inbound call log + SMS inbox (read-only v1), number management UI (update forwarding number, toggle voicemail, edit DND schedule, view/edit greeting), balance top-up flow + auto top-up settings, overage alerts and upsell prompts when approaching limits. Phase 1 backend (`phone.ts`, `signalwire.ts`, 4 DB tables) is complete per PRD; this closes the authenticated user-facing gap before public launch. |
| 98 | ✅ Done | Mid | P2 | `feature` | **Async one-way video interviews (Spark Hire replacement)** | `studioAsyncInterviews` + `studioAsyncResponses` tables. Recruiter creates interview with 1–10 questions + time limits + deadline. Shareable invite link (`/interview/:token`). Candidate recording UI: question-by-question webcam recording, progress indicator, auto-stop at max duration, submit all. Recruiter review: response list with video playback + transcription. API: `POST /async-interview`, `GET /invite/:token`, `POST /:id/respond`, `POST /:id/submit`, `GET /async-interviews`, `GET /:id/responses`. Frontend: `AsyncInterviewManager.tsx` (1,170 lines) + `AsyncInterviewPage.tsx` (229 lines). |
| 99 | 🔲 Open | Mid | P2 | `feature` | **Agency recruiter BD pipeline (Bullhorn/Vincere replacement)** | Client company pipeline distinct from candidate pipeline: employer relationship stages (prospect → qualified → contract → active → churned), open requisition tracking linked to job postings, estimated placement fee + probability + expected close date. Client contact book: employer-side contacts (hiring managers, HR directors) separate from candidate contacts. `recruiterClients` + `recruiterDeals` schema. Dashboard view: total pipeline value, win rate, at-risk accounts (no activity in 30+ days). Completes the full agency recruiter operating system alongside existing talent pool, commission tracking, and interaction log. Replaces Bullhorn/Vincere ($75–$100/user/mo). |
| 100 | 🔲 Open | Mid | P1 | `billing` | **Outplacement services — employer-paid B2B product** | Counter-cyclical to hiring slowdowns: employers purchase outplacement seats for displaced employees. Employer portal: bulk seat purchase at $149–$299/employee (Stripe one-time), seat assignment by employee email, progress dashboard (resume completion %, video resume created, applications sent, interview sessions completed). Employee experience: dedicated onboarding flow, all Pro features unlocked for seat duration (90/180/365 days), downloadable completion certificate for HR records. `outplacementSeats` + `outplacementEnrollments` tables. Targets HR buyers at companies doing layoffs — demand increases as hiring contracts. Platform already has 95% of required features (resume builder, video resume, interview prep, job matching, AI coaching). Competitors: RiseSmart, Lee Hecht Harrison ($500–$2,000/employee). |
| 101 | 🔲 Open | Mid | P2 | `feature` | **Freelance / gig marketplace** | Project posts (distinct from full-time jobs): fixed-price or hourly engagements, required skills, budget range, estimated duration. Bid/proposal flow with cover letter and proposed rate. Milestone-based escrow: Stripe Payment Intent held until client approves milestone delivery. Platform commission: 10% on completed transactions (on top of Stripe costs). Candidate skills assessment badges as trust signal. Dispute resolution workflow. Extends existing `serviceListing` stub and `placements` commission infrastructure. Targets freelancers, consultants, and contractors already on platform — same users available for full-time and contract work, no new acquisition needed. Self-sustaining flywheel as professional network grows. |
| 102 | ✅ Done | Soon | P2 | `feature` | **Personal brand / creator video type** | New studio video purpose: `personal_brand`. AI-generated scenes: elevator pitch, expertise showcase, client testimonial reel, speaking highlights, "what I do" explainer. Script generated from user bio, services, and achievements. CTA overlay (book a call, visit website, LinkedIn profile). Target: consultants, coaches, fractional executives, LinkedIn creators who need professional video content without agency cost. Credit-based pricing: one personal brand video = N credits. High organic distribution — professionals share publicly on LinkedIn, YouTube, social. Minimal build: one new `purpose` variant + 5 scene types in the existing storyboard generator (`studio.ts`). |
| 103 | ✅ Done | Mid | P2 | `feature` | **AI Career Resilience Score** | `POST /api/career/resilience-score` (Pro, AI-usage gated): input current job title → AI displacement risk score (0–100), skill gap map vs. AI-safe adjacent roles, retraining roadmap with target timeline, salary trajectory for recommended pivot roles. Data signals: job posting frequency trends in `jobItems`, skills demand analysis, LLM role-level automation risk assessment. `careerResilienceReports` table for saved reports. `GET /api/career/resilience-report/:id` public shareable link. Viral mechanic: shareable score card image (mirrors Resume Roast viral pattern from #72). Massive TAM expansion — relevant to every employed professional regardless of whether they are actively job seeking. |
| 104 | 🔲 Open | Soon | P2 | `feature` | **B2B outbound sales persona** | Extend platform to serve SDR/BDR sales teams beyond recruiting. New onboarding persona: "Sales & Business Development". Same enrichment credits (#96), outreach sequences (#95), and Business Phone (#97) repurposed for sales prospecting. UI relabelling behind feature flag: "Prospect Pipeline" (vs Talent Pool), "Deal Stages" (vs Submission Status), "Target Accounts" (vs Job Postings). Separate Pricing page section and marketing landing for "Sales Teams". No new backend required — feature flag controls persona label set and UI copy. Positions platform against Apollo ($49–$99/user/mo) + Instantly ($37–$83/mo) for SMB sales teams who cannot justify enterprise outbound tool costs. |
| 105 | 🔲 Open | Later | P3 | `feature` | **Corporate upskilling / L&D (seat-based)** | Learning paths: ordered sequences of assessments with markdown lesson content and optional video embeds (from studio) between them. Team skill dashboard for managers: coverage heatmap by skill category, assessment completion rates, badge counts per employee, skill gap identification. `learningPaths` + `learningPathSteps` + `learningEnrollments` tables. Sold as separate B2B seat license ($15–$30/seat/mo) via `companySubscriptions` new planTier `learning`. Leverages existing `skillAssessments`, `assessmentAttempts`, and skills badge infrastructure from #76. Targets HR/L&D buyers at companies reskilling workers for AI-transformed roles. Competes with LinkedIn Learning ($379/seat/yr) and Coursera for Business at a fraction of the cost. |
| 106 | ✅ Done | Soon | P1 | `billing` | **Self-serve sponsored job listing checkout** | Employer self-serve UI to boost a job to the top of search results and discovery feed. Schema already in place (`sponsored`, `sponsoredUntil`, `sponsoredRankBoost` on `jobItems` from #50) — this closes the purchasing gap. Checkout flow: select job → choose placement type (search top, discovery feed, both) → set budget + duration → Stripe one-time charge or recurring. CPM pricing with daily impression reporting. Rank boost applied in `getPublicJobs` and `GET /api/discovery/jobs` queries. Auto-expires at `sponsoredUntil` date. |
| 107 | 🔲 Open | Soon | P1 | `billing` | **Self-serve featured company profile boost** | Employer self-serve UI to promote their company profile in company search, employer brand pages, and the talent discovery feed. Extends existing `companyProfiles` schema. Placement types: company directory featured slot, employer brand spotlight in candidate dashboard, discovery feed company card. Flat weekly/monthly rate or CPM. Complements employer branding pages (#63). Purchasing flow identical to #106 — reuse checkout component. |
| 108 | ✅ Done | Mid | P2 | `feature` | **Unified ad campaign hierarchy (Campaign → Ad Set → Ad)** | Introduce the industry-standard 4-level hierarchy for employer advertising: (1) `adCampaigns` — strategic objective grouping with campaign-level budget cap and objective (`AWARENESS`, `TRAFFIC`, `APPLICATIONS`, `EMPLOYER_BRAND`); (2) `adSets` — targeting, budget, schedule, bid strategy, frequency cap; (3) `ads` — creative unit with custom headline, description, CTA text, image/video, destination URL. Refactor existing sponsored job listings and company boosts to sit under this hierarchy as Ad Sets. Renames the current email `Campaign` model to `MessagingCampaign` to avoid collision. Mirrors the LinkedIn Campaign Manager / Meta Ads Manager pattern advertisers already know. |
| 109 | 🔲 Open | Mid | P2 | `feature` | **Audience targeting on paid placements** | Add targeting capabilities to Ad Sets (#108): geographic (radius, city, country), job seeker attributes (current role, skills, years of experience, education level, open-to-work status), behavioral (recently active, viewed similar companies, used resume optimizer), time-of-day / day-of-week dayparting, device platform. Exclude existing applicants or employees. Real-time audience size estimation on targeting config UI. Data sourced from existing `userProfiles`, `jobPreferences`, and `activityLogs` — no external DMP required. Transforms paid placements from untargeted broadcast into precision employer marketing. |
| 110 | ✅ Done | Mid | P2 | `feature` | **Ad creative management** | Decouple ad creative from the underlying job listing. `ads` table (from #108): custom headline, description, CTA text (e.g. "Apply Now", "Learn More", "Watch Our Story"), primary image/video upload (distinct from job image), destination URL with dynamic tracking parameter substitution (`{CAMPAIGN_ID}`, `{AD_SET_ID}`, `{AD_ID}`, `{AD_NAME}`). A/B creative variants per Ad: two creative variants, configurable split %, automatic winner selection by CTR after statistical significance. Studio-generated video (#87) can be attached as ad creative directly. CTR tracked per creative variant for performance comparison. |
| 111 | 🔲 Open | Mid | P2 | `feature` | **Advertising analytics dashboard (ROAS + funnel)** | Unified reporting across all paid placements and email campaigns. Per-campaign metrics: impressions, clicks, CTR, applications submitted, hires (linked from `placements`), total spend, cost-per-click, cost-per-application, cost-per-hire, ROAS (placement revenue + commission value / ad spend). Conversion funnel visualisation: impression → profile click → job view → application → interview → placement. Cross-channel comparison (sponsored listing vs email campaign vs company boost). Exportable CSV/PDF reports. Date range filtering + comparison periods. Mirrors LinkedIn Campaign Manager analytics. Builds on existing `videoAnalytics` + `communicationTracking` + `activityLogs` infrastructure. |
| 112 | 🔲 Open | Later | P3 | `feature` | **Cross-channel campaign unification (paid + email in one campaign)** | Allow a single `adCampaign` (#108) to contain both paid placement Ad Sets and `MessagingCampaign` (email/push) Ad Sets. Enables coordinated omnichannel hiring campaigns: a candidate sees a sponsored job in the discovery feed, then receives a follow-up email sequence 48h later if they clicked but did not apply. Campaign-level budget shared or split across channels. Unified reach/frequency reporting across paid and email. Sequence enrollment triggered by paid ad engagement event (click → enroll in outreach sequence). Requires #108 hierarchy + #95 email delivery to be live first. |
| 113 | ✅ Done | Now | P1 | `feature` | **TTS voiceover (ElevenLabs)** | `services/tts.ts` — ElevenLabs API integration with word-level timestamps, voice listing, SRT/VTT generation. API: `GET /tts/voices`, `POST /tts/generate`, `POST /tts/generate-all`. Frontend: `VoiceoverPanel.tsx` (635 lines) — voice selection, per-scene generation, playback with word highlight preview, speed control. Env: `ELEVENLABS_API_KEY`. |
| 114 | ✅ Done | Now | P1 | `feature` | **Auto-captions (4 styles)** | `studioCaptions` table. API: `POST /captions/generate`, `GET /captions/:projectId`. `caption-renderer.ts` — canvas overlay supporting standard, bold-pop (TikTok/Reels karaoke), word-by-word, and lower-thirds styles. Frontend: `CaptionEditor.tsx` (571 lines) — cue editing, style selector, SRT/VTT export download. |
| 115 | ✅ Done | Now | P1 | `feature` | **LinkedIn video publishing (OAuth)** | `linkedinAccounts` table. Full OAuth2 flow: `GET /linkedin/auth-url`, `POST /linkedin/callback`, `GET /linkedin/accounts`, `POST /linkedin/publish` (video upload registration), `POST /linkedin/post` (create post). Frontend: `LinkedInPublisher.tsx` (589 lines) — account connection, compose with character count, visibility toggle, multi-stage publish. Env: `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`. |
| 116 | ✅ Done | Now | P1 | `feature` | **Webcam recording + teleprompter** | `studioRecordings` table. Browser-native webcam/screen/PiP recording via MediaRecorder API. API: `POST /recording/upload`, `POST /recording/:id/transcribe` (Whisper). Frontend: `WebcamRecorder.tsx` (767 lines) — camera/screen capture, audio level meter, resolution toggle, auto-stop, PiP compositing. `Teleprompter.tsx` (365 lines) — auto-scroll with WPM control, sentence highlighting, time remaining. |
| 117 | ✅ Done | Now | P1 | `feature` | **AI delivery coaching** | `studioDeliveryCoaching` table. `services/transcription.ts` — Whisper transcription + delivery analysis (pacing WPM, filler word detection, vocal variety/energy scoring). API: `POST /coaching/analyze`, `GET /coaching/:recordingId`. AI clarity scoring via LLM. Frontend: `DeliveryCoach.tsx` (493 lines) — circular score, metric bars, filler word breakdown with timestamps, suggestion cards. Env: `OPENAI_API_KEY`. |
| 118 | ✅ Done | Now | P1 | `feature` | **ATS-compatible output package** | `studioAtsPackages` table. API: `POST /ats/generate` (AI text summary + email template + unique slug), `GET /ats/:slug` (public landing page with view counter). Frontend: `ATSPackageGenerator.tsx` (353 lines) — candidate info form, generated summary + email with copy buttons, shareable link. `ATSLandingPage.tsx` (157 lines) — public page at `/v/ats/:slug` with video player, text summary, LinkedIn link, engagement tracking. |
| 119 | ✅ Done | Now | P2 | `feature` | **Interview question practice (AI coaching)** | `studioInterviewQuestions` + `studioInterviewSessions` tables. 15 default questions across behavioral/technical/situational/company-specific categories with STAR framework guidance. API: `GET /interview/questions`, `POST /interview/questions/seed`, `POST /interview/session`, `PATCH /interview/session/:id`, `GET /interview/sessions`. AI-generated talking points from resume, AI scoring + feedback on recorded answers. Frontend: `InterviewPractice.tsx` (837 lines) — filterable question library, session view with talking points + STAR guide, AI feedback panel, session history. |
| 120 | ✅ Done | Now | P2 | `feature` | **Skills demonstration videos (screen + webcam)** | `studioSkillsDemos` table. 4 templates: general, code-walkthrough, design-portfolio, data-analysis. AI script generation with per-section teleprompter text + screen instructions. API: `POST /skills-demo`, `PATCH /skills-demo/:id`, `GET /skills-demos`, `GET /skills-demos/user/:userId`, `POST /skills-demo/generate-script`. Frontend: `SkillsDemoCreator.tsx` (740 lines) — template selector, input form, AI script preview, recording flow, published demos grid. |
| 121 | ✅ Done | Now | P2 | `feature` | **Voice cloning** | `studioVoiceClones` table. API: `GET /voice-clones`, `POST /voice-clones` (upload sample → ElevenLabs clone), `DELETE /voice-clones/:id`. Frontend: `VoiceCloneManager.tsx` (422 lines) — record 30s sample or upload file, manage clones with status indicators, select clone for TTS. |
| 122 | ✅ Done | Now | P2 | `feature` | **Per-second video analytics (Wistia-quality heatmap)** | `studioVideoHeatmap` table. API: `POST /analytics/track` (per-second viewing data + email domain → company reverse-lookup), `GET /analytics/:videoId` (aggregated heatmap + viewer list + drop-off analysis). `video-tracker.ts` — attaches to `<video>` element, captures per-second viewing, sends beacon on unload. Frontend: `VideoAnalyticsDashboard.tsx` (447 lines) — metric cards, engagement heatmap bar chart, drop-off indicator, viewer table with company. |
| 123 | ✅ Done | Now | P1 | `feature` | **Video visibility toggle (public/unlisted)** | `PATCH /projects/:projectId/visibility` — updates linked video `privacyStatus` between `public` and `unlisted`. `toProjectDto` now includes `isPublic` from video. Frontend: `handleMakePublic` calls API, initializes from project state on load, shows toast. |
| 124 | 🔲 Open | Later | P2 | `feature` | **Frame-level NLE timeline (trim / split / merge / reorder)** | Clip-level drag-and-drop timeline editor: in/out point trimming via draggable handles, split-at-playhead, merge adjacent clips, multi-clip select + reorder. Requires a timeline component (e.g. custom canvas or `react-dnd` based) distinct from the current scene-level storyboard. Backend: `PATCH /studio/projects/:id/clips` for persisting clip boundaries. Brings the studio in line with CapCut / Canva Video for manual editing use cases. |
| 125 | ✅ Done | Mid | P2 | `feature` | **Visual filters and color adjustments** | `VideoFilters` interface added to `types/video-script.ts` (brightness, contrast, saturation, hueRotate, blur, warmth) plus `videoFiltersToCss()` helper that composes a CSS `filter:` string. Applied unconditionally to the preview wrapper in `StudioPreview.tsx`. UI: 5 sliders in `StudioSidebar.tsx` Theme section with Reset link, persisted on `script.video.theme.filters`. Warmth maps to a sepia + hue-rotate combo so positive values warm and negative values cool. |
| 126 | 🔲 Open | Later | P3 | `feature` | **Text-based editing via transcript (Descript-style)** | After Whisper transcription, render the full transcript as editable text. Deleting or editing a word automatically trims the corresponding video segment and removes the audio range. Requires aligning word-level timestamps (already generated by `services/tts.ts` and `services/transcription.ts`) to clip time ranges and applying cuts on export. `POST /studio/projects/:id/edit-by-transcript`. High-value for long-form recordings where finding specific segments is slow. |
| 127 | 🔲 Open | Later | P2 | `feature` | **AI background removal (no green screen)** | Browser-side person segmentation using MediaPipe Selfie Segmentation WASM or TensorFlow.js BodyPix. Applied as a real-time mask during `WebcamRecorder.tsx` preview and baked into the exported `VideoFrame` stream. Replace background with solid colour, blur, or a custom image. Zero server round-trip — WASM model loaded once and cached. Closes the greenscreen gap for remote recording use cases (job seekers recording from home offices). |
| 128 | ✅ Done | Later | P3 | `feature` | **Stock media library integration (content-addressed, deduplicated)** | `stockMediaAssets` (hash PK) + `userStockMediaUsage` schema in `studiofeatures.ts`. Migration `0002_stock_media.sql`. Aggregator service `services/stockmedia.ts` searches Unsplash + Pexels + Pixabay live (round-robin interleave; no R2 hit on search). Pick flow `POST /api/studio/stock/pick` is triple-deduped: (1) lookup by `(provider, providerAssetId)` skips download entirely; (2) otherwise download once and lookup by `sha256(bytes)` catches cross-provider duplicates; (3) only if both miss does the route PUT to R2 at `stock/<sha256>.<ext>`. Per-user picks recorded in `userStockMediaUsage` (userId, assetHash, projectId, sceneId) — same R2 object backs thousands of projects. Routes: `GET /stock/search`, `POST /stock/pick`, `GET /stock/recent`, `GET /stock/stats` (returns `bytesSaved` from dedup). Frontend: `StockMediaPanel.tsx` (debounced search, image/video toggle, recently-used grid, green "deduped · saved N KB" badge on reused picks). Wired into `StudioSidebar.tsx` as a new collapsible section — picking an image sets it as the project background. Env: `UNSPLASH_ACCESS_KEY`, `PEXELS_API_KEY`, `PIXABAY_API_KEY`. Same pipeline applies to Storyblocks/Shutterstock when added behind Premium tier. |
| 129 | ✅ Done | Mid | P2 | `feature` | **Multi-track audio mixer with per-track volume and fade** | `AudioMixConfig` + `AudioLaneConfig` added to `types/video-script.ts` (masterGain + per-lane gain/fadeIn/fadeOut/muted). `video-exporter.ts` builds `GainNode` per lane with `setValueAtTime` + `linearRampToValueAtTime` envelopes that wire each track (music, voiceover) into a master gain before the destination. UI: `AudioMixerDialog.tsx` mounted in `StudioToolbar.tsx` — master + per-lane sliders (0..200%), mute toggles, fade-in / fade-out inputs, Reset link. Edits patch `script.video.audio.mix` so the export pipeline picks them up automatically. |
| 130 | 🔲 Open | Later | P3 | `feature` | **Real-time collaborative studio editing** | Multiple users editing the same `studioProject` simultaneously. Operational-transform or CRDT-based scene-list sync via Cloudflare Durable Objects (already in stack for potential real-time chat #41). Presence cursors and named-colour user indicators on the storyboard. Conflict-free reordering using fractional indexing on `scene.order`. Targets agency workflows and employer brand teams co-creating job-ad videos. |
| 131 | ✅ Done | Soon | P3 | `feature` | **Project version history and autosave** | `studioProjectVersions` table (versionNumber, label, storyboard JSONB, isAutosave). Migration `0003_versions_chapters.sql`. Routes in `studio-features.ts`: `POST /projects/:id/versions` (create snapshot), `GET /projects/:id/versions` (list), `GET /projects/:id/versions/:vid` (full snapshot), `POST /projects/:id/versions/:vid/restore` (creates a "restored from vN" row + returns storyboard). Server-side enforcement: 50-version cap + 30-day retention via `inArray` delete on autosave rows; manual snapshots preserved beyond cap. Autosave wired in `StudioLayout.tsx` — debounced 30 s `useEffect` watches `state.script` and creates a snapshot via dynamic import. UI: `VersionHistoryDialog.tsx` with version list, restore button, and "Snapshot now" manual save. Mounted in new `StudioToolbar.tsx` above the preview canvas. |
| 132 | 🔲 Open | Later | P4 | `feature` | **Studio plugin / extension system** | Hook registry in the compiler pipeline: `registerScenePlugin(type, { compile, render, settingsUI })`. Plugins can add new SceneNode types, visual effects, or panel tabs. Plugin manifest loaded from `studioPlugins` table (URL, version, permissions). Sandboxed via iframe + postMessage for safety. Developer-facing API documented alongside OpenAPI spec. Enables community-built templates, brand kits, and integrations without core changes. |
| 133 | ✅ Done | Mid | P2 | `feature` | **Multiple aspect ratios and 4K export** | `VideoResolution` extended to `"720p" \| "1080p" \| "4k"` and `VideoAspect` to `"16:9" \| "9:16" \| "1:1" \| "4:3"`. Compiler `RESOLUTION_MAP` adds `4k: 3840×2160`, `ASPECT_MAP` adds `4:3`. UI dropdowns updated in `StudioSettings.tsx` (with `4K — Premium` label and platform hints on aspect options). 4K Premium gate enforced server-side in `POST /api/studio/upload`: reads `resolution` form field and rejects with `402 PREMIUM_REQUIRED` for non-Premium users. `studioService.uploadVideo()` and both call sites in `StudioLayout` now pass `state.resolution`. |
| 134 | 🔲 Open | Soon | P1 | `feature` | **AI avatar / talking-head generation (HeyGen / Synthesia replacement)** | Generate a fully synthetic presenter video from a text script for users who do not want to appear on camera. Library of 10–20 pre-built avatars (ethnicities, genders, business styles) plus optional custom avatar from a 2-minute selfie sample. Reuses existing TTS + voice cloning (#113, #121) for audio. Lip-sync via D-ID / HeyGen / Synthesia API behind a swappable `services/avatar.ts` provider stub. New `studio_avatars` + `studio_avatar_renders` tables. UI: "Use AI Avatar" tab in `VoiceoverPanel.tsx` as an alternative to `WebcamRecorder.tsx`. Critical for displaced workers, ESL candidates, and employer brand teams that lack on-camera talent. Replaces HeyGen / Synthesia ($30–$200/mo). |
| 135 | 🔲 Open | Mid | P2 | `feature` | **Multi-language video translation + dubbing (voice-preserved)** | One-click translate a finished video to 20+ languages: Whisper transcribes original → LLM translates each caption cue → ElevenLabs dubs in the user's cloned voice (#121) so the speaker sounds like themselves in the target language. Optional lip-sync re-render via avatar pipeline (#134). Translated caption tracks stored alongside originals in `studioCaptions`. API: `POST /studio/projects/:id/translate` with `targetLanguages[]`. Enables global hiring campaigns and unlocks ESL candidates without re-recording. Replaces Rask AI / HeyGen Translate ($24–$89/mo). |
| 136 | 🔲 Open | Soon | P1 | `feature` | **AI noise reduction & audio enhancement** | One-click cleanup of background noise, room echo, and uneven levels. Browser-side RNNoise WASM for real-time preview in `WebcamRecorder.tsx`; high-quality offline pass via Adobe Podcast Enhance API or `audo.ai` on the uploaded blob. Enhanced track stored separately on `studioRecordings`; original preserved. UI: "Enhance Audio" toggle in the post-recording panel and on async interview submissions (#98). Critical for job seekers recording from home offices — current MVP-quality audio is the single biggest perceptual blocker for video resumes. |
| 137 | 🔲 Open | Mid | P2 | `feature` | **AI eye-contact correction** | Real-time gaze redirection so users reading the teleprompter (#116) appear to look directly into camera. NVIDIA Maxine WebRTC SDK on compatible GPUs; fallback to server-side pass via `sieve.ai` or open-source LookOnce on non-GPU clients. Toggle in `WebcamRecorder.tsx` settings. Closes the "obvious teleprompter user" tell — users no longer have to choose between scripted delivery and natural eye contact. |
| 138 | 🔲 Open | Mid | P2 | `feature` | **Auto-reframe for vertical / square formats** | When the user switches aspect ratio (#133), MediaPipe Face Detection WASM re-detects the speaker per frame and generates per-time-range crop offsets stored on `storyboardScenes.reframeKeyframes`. `frame-renderer.ts` and `caption-renderer.ts` apply offsets at render time so faces are never cropped out of 9:16 or 1:1 outputs. Adobe Premiere Pro auto-reframe parity. Critical for repurposing landscape video resumes into TikTok / Reels / Shorts without re-shooting. |
| 139 | 🔲 Open | Soon | P1 | `feature` | **Direct publishing to TikTok, Instagram Reels, YouTube Shorts** | Extend the LinkedIn publishing pattern (#115) to additional short-form destinations. New OAuth providers + upload endpoints: `POST /studio/tiktok/publish`, `POST /studio/instagram/publish`, `POST /studio/shorts/publish`. New `tiktokAccounts` + `instagramAccounts` tables (YouTube already wired). Schedule-for-later via existing `scheduled.ts` cron. Frontend: provider tabs in `LinkedInPublisher.tsx` (rename to `SocialPublisher.tsx`). Combined with auto-reframe (#138), one storyboard becomes four platform-optimised exports. Critical for personal-brand creators (#102) and employer brand teams. |
| 140 | ✅ Done | Soon | P1 | `feature` | **In-video lead capture forms (Wistia Turnstile replacement)** | `studioVideoForms` + `studioVideoFormSubmissions` schema. Migration `0004_forms_reviews_thumbnails.sql`. Routes: `GET/POST /projects/:id/forms`, `PATCH/DELETE /forms/:id`, `GET /videos/:videoId/forms/public` (anonymous embedded-player fetch), `POST /forms/:id/submit` (public — validates required fields, mirrors `email`/`name`/`company` answers into the global `marketingLeads` table for the unified inbox), `GET /forms/:id/submissions` (owner). Frontend: `VideoFormsDialog.tsx` — list, create with name+email toggles + gate-playback switch + redirect URL, inline submissions viewer. Mounted in `StudioToolbar.tsx`. |
| 141 | ✅ Done | Mid | P2 | `feature` | **Video chapter markers + interactive table of contents** | `studioChapters` table (projectId, title, startSeconds, thumbnailUrl, orderIndex). Migration `0003_versions_chapters.sql`. Routes: `GET/POST /projects/:id/chapters`, `PATCH/DELETE /chapters/:id`, `GET /projects/:id/chapters/youtube` (returns `0:00 Intro`-style text for YouTube/LinkedIn descriptions). UI: `ChapterEditor.tsx` dialog auto-seeds chapters from compiled scene boundaries on first open, supports timestamp-format input (`mm:ss` or `hh:mm:ss`) with parser, and one-click copy of the YouTube text. Mounted in `StudioToolbar.tsx`. |
| 142 | ✅ Done | Mid | P2 | `feature` | **AI thumbnail generator** | `studioThumbnails` schema (imageUrl, sourceTimeSec, score, isSelected). Routes: `POST /projects/:id/thumbnails/score` (heuristic + LLM ranking via `callLLMJson` with Zod, falls back to heuristic when no API key), `GET /projects/:id/thumbnails`, `PATCH /projects/:id/thumbnail` (clears prior selection then activates). Frontend: `ThumbnailsDialog.tsx` — extracts 6 evenly-spaced frames from the published video URL via a hidden `<video>` + `<canvas>` `drawImage` pipeline (data-URL JPEG at 0.72 quality), uploads to `/score`, displays ranked candidates with selectable click-to-pick UX. |
| 143 | 🔲 Open | Mid | P2 | `feature` | **AI hook optimizer (first 3 seconds)** | Analyses the opening 3 seconds of a video for retention-killing patterns (slow start, no face, no captions, low energy) and suggests rewrites. Reuses delivery coach (#117) signals + drop-off data (#122) on already-published videos. LLM generates 3 alternative scripted hook variants. A/B test variants by re-rendering only scene 0 (cheap) and rotating across viewers. New `POST /studio/projects/:id/hook/optimize`. Closes the single biggest retention lever for short-form content. |
| 144 | ✅ Done | Mid | P3 | `feature` | **AI script rewriter (tone, length, persona)** | `POST /api/studio/projects/:id/script/rewrite` — 4 modes (`shorten`, `lengthen`, `tone`, `persona`) with `targetSeconds`, `tone` (professional/conversational/enthusiastic/executive), `persona` (job-seeker/recruiter/company-promo/personal-brand), and free-form `instructions`. Calls `callLLMJson` with a Zod schema that requires a `scenes[]` array. System prompt instructs the model to preserve scene `type`, `visual`, and `camera` fields exactly. UI: `ScriptRewriterDialog.tsx` mounted in `StudioToolbar.tsx` — mode selector, dynamic config UI per mode, scene-list preview before accept, splices new scenes back into `state.script` on apply. |
| 145 | ✅ Done | Later | P3 | `feature` | **Frame.io-style review comments on video** | `studioReviewComments` (parentId for threading, timestampSec for pin, resolved flag) + `studioReviewLinks` (24-byte hex shareToken via `crypto.getRandomValues`, optional expiry). Routes: `POST/GET /projects/:id/review-links`, `DELETE /review-links/:id`, `GET /projects/:id/comments`, `POST /projects/:id/comments` (authed), `GET /review/:shareToken` (public — resolves token, returns project + comment thread, honours expiry with HTTP 410), `POST /review/:shareToken/comments` (anonymous post by external reviewers), `PATCH /comments/:id` (resolve toggle, owner-only), `DELETE /comments/:id`. Frontend: `ReviewCommentsDialog.tsx` — public link manager with copy-to-clipboard, threaded comment list with resolve/delete, time-pinned reply input wired to `currentTimeSec` from playback. |

