# hired.video — Studio: Complete Spec & Task List

> Combines: UI Architecture · Video Compiler Engine · Growth & GTM Features  
> Supersedes: `COMPILER_UPGRADE_SPEC.md`, `GROWTH_FEATURES_SPEC.md`

---

## Vision

**hired.video Studio** is a browser-native AI video creation workspace that turns a resume into a shareable professional video in under 60 seconds.

The product is positioned as:

> *"The fastest way to stand out on LinkedIn."*

The architecture is a **Prompt → Video Compiler** pipeline — the same conceptual leap that made React powerful applied to video:

```
User Prompt + Resume
        ↓
  LLM (OpenRouter)       → generates Video Script DSL
        ↓
  Video Compiler         → builds Scene Graph + Animation Graph
        ↓
  Frame Renderer         → Canvas 2D (WebGPU Phase 2)
        ↓
  WebCodecs Encoder      → VideoFrame pipeline
        ↓
  MP4 Muxer              → Blob
        ↓
  Upload → YouTube       + LinkedIn Post Package
```

The growth loop:

```
User creates video → shares on LinkedIn ("Created with hired.video ✨")
  → impressions → new users → create → share → compound growth
```

---

## Current State

| Item | Status |
|---|---|
| `/studio` route | 5-step wizard (to be replaced) |
| Storyboard generation | `POST /api/studio/storyboard` — mock only |
| Video recording | Canvas 2D + MediaRecorder → WebM blob |
| Publish | Upload → fake YouTube ID → poll |
| LLM key | `OPENROUTER_API_KEY` secret set — **never called** |

---

## Part 1 — UI Architecture (AI Studio Layout)

### Layout

Three-panel full-viewport workspace. Replaces the wizard entirely.

```
┌──────────┬──────────────────────────┬──────────────────┐
│ Sidebar  │       Editor             │  Settings        │
│  260px   │       flex-1             │  320px           │
│          │  [Prompt|Storyboard|     ├──────────────────┤
│          │   Timeline]              │  Preview         │
│          │                          │  (canvas 16:9)   │
└──────────┴──────────────────────────┴──────────────────┘
```

Tailwind CSS:
```css
.studio-layout      { @apply flex h-screen overflow-hidden bg-background; }
.studio-sidebar     { @apply w-[260px] flex-shrink-0 border-r bg-card overflow-y-auto flex flex-col; }
.studio-editor      { @apply flex-1 min-w-0 overflow-y-auto flex flex-col; }
.studio-right-panel { @apply w-[320px] flex-shrink-0 border-l flex flex-col overflow-y-auto; }
```

The existing app-level `Navigation`/`Sidebar` wrappers are removed inside Studio — it takes the full viewport. `App.tsx` route is unchanged; `Studio.tsx` becomes a one-line re-export of `StudioLayout`.

### File Structure

```
frontend/pages/studio/
  Studio.tsx              ← re-export: export { default } from "./StudioLayout"
  StudioLayout.tsx        ← top-level state, layout, auth gate
  StudioSidebar.tsx       ← project nav, templates, recent
  StudioEditor.tsx        ← Prompt / Storyboard / Timeline tab switcher
  StudioPreview.tsx       ← right panel: canvas + Export + Publish + LinkedIn
  StudioSettings.tsx      ← AI settings + Video settings

frontend/components/
  PromptEditor.tsx        ← resume textarea, prompt textarea, job JD toggle, Run
  StoryboardEditor.tsx    ← editable scene cards backed by VideoScript.scenes
  TimelineEditor.tsx      ← proportional scene blocks, click-to-focus
  VideoPreview.tsx        ← canvas RAF loop, play/pause
  LinkedInPostModal.tsx   ← hook + caption editor + share intent
  RoastResult.tsx         ← resume score + analysis display
  ScoreCard.tsx           ← canvas-rendered shareable score image

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
  services/
    studio-service.ts     ← extended API client

frontend/types/
  video-script.ts         ← VideoScript DSL types
  studio.ts               ← StudioProjectState

frontend/data/templates/
  video-resume-professional.json
  video-resume-minimal.json

frontend/pages/
  ResumeRoast.tsx         ← /resume-roast standalone page
  PublicVideoResume.tsx   ← /v/:videoId public page

api/src/routes/
  studio.ts               ← updated: real LLM call, VideoScript output
  resume-roast.ts         ← POST /api/resume/roast
  linkedin-post.ts        ← POST /api/studio/linkedin-post
  og.ts                   ← GET /api/og/v/:videoId (OG image)
```

### Component Specs

#### `StudioLayout.tsx`
Top-level state owner. No wizard steps. State shape (`StudioProjectState`):
```ts
{
  id?: string
  name: string
  prompt: string
  resumeText: string
  jobDescription?: string       // Feature G3: video for this job
  script: VideoScript | null    // replaces storyboard
  compiledVideo: CompiledVideo | null
  videoBlob: Blob | null
  projectId: string | null
  youtubeVideoId: string | null
  status: "idle" | "generating" | "ready" | "exporting" | "uploading" | "publishing" | "done" | "error"
  model: string                 // default "google/gemini-flash-1.5"
  temperature: number           // 0–1
  resolution: "720p" | "1080p"
  aspectRatio: "16:9" | "9:16" | "1:1"
  targetDuration: number        // seconds
  motion: "minimal" | "moderate" | "cinematic"
}
```
Unauthenticated users see the existing marketing landing page.

#### `StudioSidebar.tsx`
- **+ Create New** → resets state to blank project
- **Recent** → `studioService.getProjects()` on mount, lists name + status badge + date
- **Templates** → loads `VideoScript` JSON from `frontend/data/templates/`
- **Resume Roast** shortcut link → `/resume-roast`

#### `StudioEditor.tsx`
Tabs: **Prompt** | **Storyboard** | **Timeline**  
Auto-switches to Storyboard after generation. Auto-switches to Timeline on scene card click.

#### `PromptEditor.tsx`
- Resume text textarea (DOCX/TXT drop or paste)
- Prompt textarea ("Create a 30s video for a senior engineer")
- **[+ Add Job Description]** toggle → reveals JD textarea (Feature G3)
- **Run** button → calls API → compiler runs → tab switches to Storyboard

#### `StoryboardEditor.tsx`
2×2 editable scene cards. Per card: type badge, inline-editable title/subtitle/text/skills/items, duration stepper (3–30s). All edits trigger recompile → preview updates in < 200ms.

#### `TimelineEditor.tsx`
Proportional blocks (`scene.duration * 20px`). Playhead synced to `VideoPreview.onTimeUpdate`. Clicking block focuses card.

#### `VideoPreview.tsx`
RAF loop calling `frameRenderer.render(ctx, compiledVideo, time)`. Props: `{ compiledVideo, playing, onTimeUpdate? }`. Loops at end.

#### `StudioPreview.tsx`
Controls: Play/Pause · **Export MP4** · **Publish** (upload → poll) · **Generate LinkedIn Post** · **Make Public** toggle · Progress bar.

#### `StudioSettings.tsx`
AI accordion: Model, Temperature, Top P (collapsed), Max Tokens.  
Video accordion: Resolution, Aspect Ratio, Duration, Motion style.

---

## Part 2 — Video Compiler Engine

### Why a Compiler

AI generates a **Video Script DSL** — a declarative video *program*. The compiler converts it into `CompiledVideo` that the renderer evaluates at any frame.

Benefits:
- Scene card edits → recompile only (no LLM re-call) → < 200ms preview update
- Templates = pre-built scripts, instant preview
- AI-assisted edits: surgical field changes, no regeneration
- Future: versioning, diff, undo/redo

### Video Script DSL (`frontend/types/video-script.ts`)

```ts
interface VideoScript {
  video: {
    duration: number
    fps: number                       // default 30
    resolution: "720p" | "1080p"
    aspect: "16:9" | "9:16" | "1:1"
    theme: VideoTheme
  }
  scenes: SceneScript[]
}

interface VideoTheme {
  colorPalette: string[]              // 3–5 hex colors
  fontFamily: string
  motion: "minimal" | "moderate" | "cinematic"
  transition: "cut" | "fade" | "slide" | "cinematic-fade"
  background: "gradient" | "dark-tech-grid" | "particles" | "solid"
}

interface SceneScript {
  id: string
  start: number                       // absolute seconds
  duration: number
  type: "intro" | "achievement" | "skills" | "closing"
  title?: string
  subtitle?: string
  text?: string | string[]
  items?: string[]                    // bullet list (achievements)
  skills?: string[]
  highlight?: boolean                 // AI edit flag
  animation?: {
    titleEnter?: AnimationSpec
    subtitleEnter?: AnimationSpec
    textEnter?: AnimationSpec
  }
  effects?: Array<{ type: "particles" | "blur" | "glow" | "vignette"; intensity: number }>
}

interface AnimationSpec {
  type: "fadeIn" | "slideUp" | "slideIn" | "scaleIn" | "typewriter" | "none"
  start: number
  duration: number
  easing?: "linear" | "easeIn" | "easeOut" | "easeInOut" | "spring"
}
```

### Compiler Pipeline

```
compile(VideoScript) → CompiledVideo
  1. Validate (start+duration sums ≤ video.duration)
  2. Resolve theme defaults into each scene
  3. buildSceneGraph(scene, theme) → SceneNode tree
  4. compileAnimation(spec) → CompiledAnimation per node
  5. Return CompiledVideo { getSceneAt(time), totalDuration, fps, width, height }
```

### Scene Graph

| Scene type | Node tree |
|---|---|
| `intro` | Background → ParticleSystem → Text(title) → Text(subtitle) |
| `achievement` | Background → Text(title) → TextGroup(items[]) |
| `skills` | Background → Text(title) → SkillBubble[] |
| `closing` | Background → Overlay(fade) → Text(title) |

### Animation Graph

Each `AnimationSpec` → `CompiledAnimation { property, fromValue, toValue, startTime, endTime, easing, evaluate(elapsed) }`.

Mappings: `fadeIn → alpha 0→1`, `slideUp → y +40→0`, `slideIn → x +60→0`, `scaleIn → scale 0.8→1`, `spring → damped sine`.

### Frame Renderer

```ts
render(ctx: CanvasRenderingContext2D, compiledVideo: CompiledVideo, time: number): void
// → getSceneAt(time) → evaluate animations → drawNode() per node
```

Canvas 2D node rendering (gradients, text, arcs, particles) matches existing `renderScene()` visual output.

### WebCodecs Export

```ts
exportVideo(compiledVideo: CompiledVideo): Promise<Blob>
```

```
OffscreenCanvas → frame loop → frameRenderer.render → transferToImageBitmap
→ VideoFrame → VideoEncoder (avc1.42E01E, 4Mbps/2Mbps) → mp4-muxer → Blob
```

**Fallback:** if `typeof VideoEncoder === "undefined"` → `MediaRecorder + captureStream(30)`.

### Backward Compatibility

`storyboardToVideoScript(sb: Storyboard): VideoScript` adapter converts all existing DB rows. Old projects load and render correctly.

---

## Part 3 — Backend: Real LLM Call

### `POST /api/studio/storyboard`

**Extended request body:**
```ts
{
  resumeText: string
  prompt?: string
  jobDescription?: string      // Feature G3
  model?: string               // default "google/gemini-flash-1.5"
  temperature?: number         // default 0.7
  targetDuration?: number      // default 28
  resolution?: "720p" | "1080p"
  motion?: "minimal" | "moderate" | "cinematic"
}
```

**OpenRouter call:**
- `POST https://openrouter.ai/api/v1/chat/completions`
- `Authorization: Bearer ${env.OPENROUTER_API_KEY}`
- `response_format: { type: "json_object" }`
- Validate with `VideoScriptSchema.safeParse()`
- **Fallback:** key missing or call fails → `buildMockStoryboard()` → `storyboardToVideoScript()`

**System prompt template:**
```
You are a professional video director. Produce a JSON video script for a 20–30 second video resume.
Rules: exactly 4 scenes (intro/achievement/skills/closing), start times sequential and sum to video.duration,
extract real name/role/achievements with numbers/4–6 skills, motion style: ${motion}.
Return ONLY valid JSON matching the VideoScript schema.

${jobDescription ? `Personalise intro for role: ${roleTitle} at ${companyName}. Filter to relevant achievements/skills.\nJob: ${jobDescription}` : ""}

User direction: ${prompt || "Professional video resume"}
Resume: ${resumeText}
```

### `POST /api/studio/edit-script`

```ts
Body: { script: VideoScript, instruction: string }
Response: { script: VideoScript }
```

LLM makes minimal targeted changes based on instruction. No full regeneration needed.

---

## Part 4 — Growth & GTM Features

### G1 — LinkedIn Post Package

**Growth mechanic:** every generated post ends with `Created with hired.video ✨`.

Flow: StudioPreview → **[Generate LinkedIn Post]** → `POST /api/studio/linkedin-post` → `LinkedInPostModal`.

Modal: editable hook + caption + hashtags → **[Copy Caption]** + **[Post to LinkedIn]** (share intent).

```
https://www.linkedin.com/sharing/share-offsite/?url=https://hired.video/v/{videoId}&summary={encoded}
```

API output: `{ hook, caption, hashtags, fullPost }`. LLM generates 3-line hook, 4-bullet caption with real achievements, 3–5 hashtags. Attribution always appended.

---

### G2 — AI Resume Roast

**Viral mechanic:** "AI roasted my resume 😅" → shareable score card → top-of-funnel.

Route: `/resume-roast`. Ships standalone — **no compiler dependency**.

API: `POST /api/resume/roast` → `{ score: 7.2, strengths, weaknesses, roast, fixes, improvedExamples }`.

Shareable score card: Canvas-rendered 1200×630 PNG (`ScoreCard.tsx`) users download and post as LinkedIn native images (higher reach than link posts).

CTA at bottom: **[Create Video Resume →]** feeds users into Studio.

---

### G3 — Video Resume for This Job

**One textarea, huge impact.** Pastes job description into PromptEditor. AI personalises:
- Scene 1 intro: "Hi, I'm [name]. I'm applying for [role] at [company]."
- Achievement scene: only resume items relevant to JD
- Skills scene: only skills matching JD

API change: `jobDescription` field passed through to LLM prompt — already covered in Part 3.

---

### G4 — Public Video Resume Pages

Route: `/v/:videoId` (no auth required).

Page: name, role, video embed, social links, AI-generated bio, hired.video attribution.

OG tags for rich LinkedIn/Slack/Twitter previews:
```html
<meta property="og:title" content="John Smith — Senior Software Engineer" />
<meta property="og:image" content="https://hired.video/api/og/v/{videoId}" />
<meta property="og:video" content="{videoUrl}" />
```

`GET /api/og/v/:videoId` → 1200×630 PNG (satori). `isPublic: boolean` DB column + StudioPreview toggle.

---

## Part 5 — Resume-Video Association

### V1 — Resume Selector in Studio

When a user creates a video in Studio, they can select an existing resume from their account instead of pasting text. This links the generated video back to the resume.

**UI (existing wizard `StepUpload` + future `PromptEditor.tsx`):**
```
[ Use existing resume ▼ ]   ← dropdown: fetches /api/Resume/GetResumesOwnedbyAuthUser
     or
[ Paste / upload text below ]
```

When a resume is selected:
1. `resumeService.getResumeById(id)` fetches the full resume
2. `extractResumeText(resume)` converts JSON Resume fields to a flat string (basics + work + education + skills)
3. `resumeText` textarea is pre-filled and `resumeId` is stored in project state

**`StudioProjectState` addition:**
```ts
resumeId?: string   // references resumeInformation.id
```

**API threading:**
- `POST /api/studio/storyboard` body: `{ resumeText, resumeId? }` → stored on `studioProjects.resumeId`
- `POST /api/studio/upload` form field: `resumeId?` → set on created `videos.resumeId`
- `POST /api/studio/publish` body: `{ resumeId? }` → set on `videos.resumeId`

**DB change:** Add `resumeId uuid` to `studioProjects` table (nullable).

---

### V2 — Video Display on Resume Detail Page

`GET /resumes/:id` page shows published studio videos associated with this resume.

**New endpoint:** `GET /api/studio/videos/resume/:resumeId`
- No auth required for public videos (`videos.privacyStatus = 'public'`)
- Auth required to see own private/unlisted videos
- Returns: `{ id, title, videoUrl, youtubeUrl, youtubeVideoId, thumbnailUrl, privacyStatus, createdAt }[]`

**`ResumeDetail.tsx` change:**
- On mount, fetch `GET /api/studio/videos/resume/:id` alongside the resume
- Studio videos are merged into the existing video carousel (same component) with label "Studio Video"
- If user is owner and no studio videos exist: show CTA card **[Create Video Resume →]** linking to `/studio`

---

### V3 — Published Videos on Homepage

All videos published with `privacyStatus: 'public'` appear in a **Video Resumes** feed section on the homepage.

**New endpoint:** `GET /api/studio/videos/public`
- No auth required
- Returns most recent 20 public videos: `{ id, title, videoUrl, youtubeUrl, thumbnailUrl, ownerName, ownerAvatar, resumeTitle, createdAt }[]`
- Joins `videos` → `users` for owner name/avatar and `studioProjects` for resume context

**`Index.tsx` change:**
- Fetch `GET /api/studio/videos/public` on mount (parallel to other homepage data)
- Render a **"Video Resumes"** section using `VideoCard` components
- Each card links to `/v/:videoId` (public page)
- Section only shown when there is at least one public video

---

## Dependencies

| Package | Purpose | Status |
|---|---|---|
| `mp4-muxer` | WebCodecs H.264 → MP4 | Add |
| `webm-muxer` | VP9 fallback | Add |
| `jszip` | DOCX parsing | Installed |
| `framer-motion` | Animations | Installed |
| `lucide-react` | Icons | Installed |
| `zod` | Schema validation | Installed |

---

## Full Task List

### Phase 0 — Foundation

- [x] **T-01** Create `frontend/types/video-script.ts` — `VideoScript`, `SceneScript`, `VideoTheme`, `AnimationSpec`, `SceneEffect`
- [x] **T-02** Create `frontend/types/studio.ts` — `StudioProjectState` (includes `script`, `compiledVideo`, `jobDescription`, `motion`)
- [x] **T-03** Create `frontend/lib/compiler/types.ts` — `CompiledVideo`, `CompiledScene`, `SceneNode`, `Transform2D`, `NodeStyle`, `CompiledAnimation`
- [x] **T-04** Update `frontend/lib/services/studio-service.ts` — `generateStoryboard` accepts full params incl. `jobDescription`, `motion`; returns `VideoScript`

### Phase 1 — Compiler

- [x] **T-05** Create `frontend/lib/compiler/animation-graph.ts` — `compileAnimation()`, all easings, `evaluate(elapsed)`
- [x] **T-06** Create `frontend/lib/compiler/scene-graph.ts` — `buildSceneGraph()`, one builder per scene type
- [x] **T-07** Create `frontend/lib/compiler/video-compiler.ts` — `compile(script): CompiledVideo`, `getSceneAt(time)`
- [x] **T-08** Create `frontend/lib/compiler/storyboard-adapter.ts` — `storyboardToVideoScript(sb): VideoScript`

### Phase 2 — Renderer & Exporter

- [x] **T-09** Create `frontend/lib/renderer/canvas-nodes.ts` — `drawNode(ctx, node)` all types
- [x] **T-10** Create `frontend/lib/renderer/frame-renderer.ts` — `render(ctx, compiledVideo, time)`
- [x] **T-11** Create `frontend/lib/renderer/video-exporter.ts` — `exportVideo()` WebCodecs + mp4-muxer + MediaRecorder fallback
- [x] **T-12** Install `mp4-muxer` and `webm-muxer`

### Phase 3 — Studio UI

- [x] **T-13** Create `frontend/pages/studio/StudioLayout.tsx` — 3-panel layout, full state owner, marketing landing for anon
- [x] **T-14** Create `frontend/pages/studio/StudioSidebar.tsx` — Create New, recent projects, templates, Roast link
- [x] **T-15** Create `frontend/pages/studio/StudioEditor.tsx` — tab switcher with auto-switch logic
- [x] **T-16** Create `frontend/components/PromptEditor.tsx` — resume + prompt + JD toggle + Run
- [x] **T-17** Create `frontend/components/StoryboardEditor.tsx` — inline-editable cards, recompile on change
- [x] **T-18** Create `frontend/components/TimelineEditor.tsx` — proportional blocks, playhead sync
- [x] **T-19** Create `frontend/components/VideoPreview.tsx` — RAF loop, `frameRenderer.render()`, play/pause
- [x] **T-20** Create `frontend/pages/studio/StudioPreview.tsx` — Export MP4, Publish, LinkedIn Post, visibility toggle
- [x] **T-21** Create `frontend/pages/studio/StudioSettings.tsx` — AI + Video settings
- [x] **T-22** Update `frontend/pages/studio/Studio.tsx` → one-line re-export
- [x] **T-23** Add studio CSS to `frontend/global.css`

### Phase 4 — Templates

- [x] **T-24** Create `frontend/data/templates/video-resume-professional.json`
- [x] **T-25** Create `frontend/data/templates/video-resume-minimal.json`

### Phase 5 — Backend

- [x] **T-26** Update `api/src/routes/studio.ts` — real OpenRouter LLM, `VideoScript` output, `jobDescription` support, fallback to mock
- [x] **T-27** Add `POST /api/studio/edit-script` — AI surgical editing endpoint
- [x] **T-28** Create `api/src/routes/linkedin-post.ts` — `POST /api/studio/linkedin-post`
- [x] **T-29** Wire new routes into `api/src/app.ts`

### Phase 6 — Growth Features

- [x] **T-30** Create `frontend/components/LinkedInPostModal.tsx`
- [x] **T-31** Add LinkedIn Post button to `StudioPreview.tsx`
- [x] **T-32** Create `api/src/routes/resume-roast.ts` — `POST /api/resume/roast`
- [x] **T-33** Wire `resumeRoastRoutes` into `api/src/app.ts`
- [x] **T-34** Create `frontend/pages/ResumeRoast.tsx`
- [x] **T-35** Create `frontend/components/RoastResult.tsx`
- [x] **T-36** Create `frontend/components/ScoreCard.tsx`
- [x] **T-37** Add `/resume-roast` route in `frontend/App.tsx`
- [x] **T-38** Add Resume Roast nav link + Studio landing CTA
- [x] **T-39** Add `isPublic: boolean` to `videos` table (Drizzle migration)
- [x] **T-40** Create `api/src/routes/og.ts` — OG image endpoint
- [x] **T-41** Create `frontend/pages/PublicVideoResume.tsx`
- [x] **T-42** Add `/v/:videoId` route in `frontend/App.tsx` (no auth)
- [x] **T-43** Expose `GET /api/studio/public/:videoId` (no auth middleware)

### Phase 7 — QA

- [x] **T-44** Verify `App.tsx` route works end-to-end with new Studio re-export
- [x] **T-45** Smoke test: resume paste → Run → preview → Export MP4 → Publish → public page → LinkedIn post

### Phase 8 — Resume-Video Association

- [x] **V-01** Add `resumeId uuid` (nullable) to `studioProjects` in `api/src/db/schema/resumes.ts`
- [x] **V-02** Update `POST /api/studio/storyboard` to accept + store optional `resumeId`
- [x] **V-03** Update `POST /api/studio/upload` to thread `resumeId` onto created `videos` row
- [x] **V-04** Update `POST /api/studio/publish` to set `resumeId` on `videos` row
- [x] **V-05** Add `GET /api/studio/videos/resume/:resumeId` — returns videos for a resume (public: no auth; private: auth-gated)
- [x] **V-06** Add `GET /api/studio/videos/public` — returns 20 most-recent public videos with owner info
- [x] **V-07** Update `studioService` — `generateStoryboard(resumeText, resumeId?)`, `uploadVideo(blob, title, projectId?, resumeId?)`, add `getVideosForResume(id)`, `getPublicVideos()`
- [x] **V-08** Add resume selector to `StepUpload` in `Studio.tsx` — dropdown loads user resumes, auto-fills text, stores `resumeId`
- [x] **V-09** Update `ResumeDetail.tsx` — fetch studio videos for resume, merge into video carousel, owner CTA
- [x] **V-10** Update `Index.tsx` — fetch public videos, render "Video Resumes" section with `VideoCard`

---

## Priority Order

| Priority | Tasks | Ships |
|---|---|---|
| 🔥 P0 | T-01–T-04, T-26 | Real LLM storyboard call |
| 🔥 P0 | T-32–T-38 | Resume Roast (standalone, no compiler needed) |
| 🔥 P0 | V-01–V-10 | Resume-video linking, homepage feed, resume detail videos |
| ⚡ P1 | T-05–T-23 | Compiler + full Studio UI |
| ⚡ P1 | T-28–T-31 | LinkedIn Post Package |
| 🔵 P2 | T-24–T-25 | Templates |
| 🔵 P2 | T-27 | AI-assisted editing |
| 🔵 P2 | T-39–T-43 | Public pages + OG images |
| ⬜ P3 | T-44–T-45 | QA sweep |

---

## Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| `VideoEncoder` not in all browsers | High | MediaRecorder fallback; feature-detect |
| WebGPU not available | Low | Canvas 2D only in this phase |
| LLM returns malformed VideoScript | High | Zod `safeParse` + auto-fallback to mock |
| mp4-muxer H.264 support varies | Medium | webm-muxer secondary fallback |
| 1080p export blocks main thread | Medium | OffscreenCanvas + async encode |
| Old DB `Storyboard` rows | Low | `storyboardToVideoScript()` adapter |
| LinkedIn native video needs OAuth | Medium | Share intent only (no OAuth for Phase 1) |

---

## Success Criteria

- [ ] Paste resume → AI returns valid `VideoScript` in < 10s
- [ ] Compiler builds `CompiledVideo` with no runtime errors
- [ ] Live preview plays all 4 scenes correctly
- [ ] Editing a scene card recompiles + updates preview in < 200ms
- [ ] Export produces valid MP4/WebM that plays in Chrome
- [ ] Export completes in < 60s for 28s 1080p video
- [ ] Resume Roast returns score + analysis in < 8s
- [ ] Public page `/v/:videoId` loads without auth, renders OG tags
- [ ] LinkedIn Post modal generates hook + caption with real resume data

---

## Out of Scope

- Real YouTube Data API OAuth
- PDF client-side text extraction
- Drag-resize / reorder timeline
- WebGPU shader effects (Phase 2)
- Vanity URLs (`hired.video/john-smith`)
- LinkedIn native video API
- Video analytics
- Collaborative editing

---

## Studio Core UX & Feature Gaps (2026-03-16)

> Findings from a full code audit of the Studio implementation.
> Many declared features exist only as type stubs with no rendering logic.

### Implementation Status (updated 2026-03-17)

| # | Gap | Status |
|---|---|---|
| S1 | Template UX — redirect to prompt tab | ✅ Done |
| S2 | Skills chip UI | ✅ Done |
| S3 | Audio support | ❌ Not started |
| S4 | Image/graphic asset nodes | ✅ Done — per-scene AI image generation + custom upload |
| S5 | Typewriter animation | ✅ Done |
| S6 | All 4 transition styles | ✅ Done |
| S7 | Color/font/background theme editor | ✅ Done |
| S8 | Scene effects (blur/glow/vignette) | ❌ Not started |
| S9 | Undo/redo | ✅ Done |
| S10 | Timeline scrubbing | ✅ Done |
| S11 | Scene add/delete/reorder | ✅ Done — add, delete, up/down reorder, type change |
| S12 | Interview mock ignores JD | ✅ Done |
| S13 | Interview LLM not JD-personalised | ✅ Done |
| S14 | Interview session history UI | ❌ Not started |
| S15 | UTM params on share links | ❌ Not started |
| S16 | View count increment | ❌ Not started |
| S17 | Vanity username URLs | ❌ Not started |
| S18 | Resume on public profile | ❌ Not started |
| S19 | Per-scene accent color | ✅ Done |
| S20 | Timeline click → seek video | ✅ Done |
| S21 | Template switch preserves scene content | ✅ Done — theme-only apply with confirm dialog |
| S22 | Theme settings in left panel | ✅ Done — moved to sidebar |

### Additional features shipped beyond spec (2026-03-17)

- **Save Draft** — project name input + Save button above action panel; saves `{ name, script }` to `studioProjects` via `POST /api/studio/save-draft`; saved project appears in Recent Projects list immediately; loading a saved project restores the VideoScript and recompiles
- **Background picker** — 8 preset gradient/style swatches + custom image upload in sidebar; updates `video.theme.background` + `colorPalette`; custom image rendered cover-fit in canvas via async image cache
- **Default motion-aware animations** — all scenes now animate by default (slideUp/fadeIn/scaleIn based on `theme.motion`) even when the AI doesn't specify `animation` specs; stagger delay between nodes
- **Export progress** — frame encoding scaled to 0–80%; explicit checkpoints at encoder.flush (82–92%), muxer.finalize (92–97%), blob creation (100%)
- **textGroup centering** — bullet point lists now have equal margin on both sides
- **skillBubble capped at 3 columns**
- **Watermark** — "hired.video" pill (hired=white, .video=brand purple) in bottom-right corner of all exported frames
- **Undo/redo keyboard shortcuts** — Ctrl+Z / Ctrl+Shift+Z
- **Per-scene accent color** — color picker per SceneCard overrides primary palette color for that scene's background and nodes
- **Timeline → seek** — clicking a scene block in the timeline seeks the video to that scene's start time and highlights it in the Storyboard tab
- **Template theme-only switch** — loading a template when scenes exist applies only the theme (with confirm dialog); scene content is preserved
- **Theme panel in left sidebar** — color palette, font, and transition controls moved from right panel to left sidebar; visible once a script is loaded
- **skillBubble capped at 2 columns** (was 3)
- **Editable skill chips** — double-click a chip to edit inline

---

### S1 — Template Selection UX

**Current behaviour:**
- Selecting a template loads a `VideoScript` JSON and recompiles immediately.
- If the user hasn't entered a resume, they get placeholder text ("Your Name", "Key Achievements").
- There is **no redirect to the Prompt tab** — user lands on a blank-looking storyboard with dummy content.

**Required behaviour:**
1. When a template is selected and `state.resumeText` is empty → switch active tab to `"prompt"` and show a toast: _"Template loaded. Add your resume to personalise it."_
2. When a template is selected and `state.resumeText` is non-empty → recompile immediately with the resume text merged into the template scenes via a call to `/api/studio/storyboard` (so AI populates real content).
3. Add a "Template loaded: Professional" pill badge in the Prompt tab header.

**Files to change:** `StudioLayout.tsx` → `handleTemplateLoad()`, `StudioEditor.tsx` → respect forced tab switch.

---

### S2 — Skills Display in Storyboard Editor

**Current behaviour:**
- Skills are a single comma-separated `<input>` field.
- Users must type `"React, TypeScript, Node.js"` — no visual feedback, no per-skill editing.
- Deleting one skill requires manually editing the string.

**Required behaviour:**
- Replace the comma input with a **tag chip UI**: each skill is an individual row/chip with an ✕ button.
- Add-new input at the bottom: type skill name → press Enter or comma → adds chip.
- Chips reorder with drag (same `@dnd-kit/sortable` as Gap 1).
- Max 8 skills enforced in UI with a counter badge.
- `onSkillsChange(skills: string[])` collapses back to comma-delimited for `SceneScript`.

**Files to change:** `StoryboardEditor.tsx` → skills section only.

---

### S3 — Audio File Support

**Current behaviour:** Audio is **completely absent** — no fields in `VideoScript`, no upload UI, no audio context in preview, no mixing in export.

**Required implementation:**

#### Types (`video-script.ts`)
```ts
interface VideoScript {
  // ... existing fields
  audio?: {
    backgroundMusic?: AudioTrack
    voiceover?: AudioTrack
  }
}
interface AudioTrack {
  r2Key: string
  url: string
  volume: number       // 0–1, default 0.8
  fadeIn: number       // seconds
  fadeOut: number      // seconds
  loop: boolean
}
```

#### Studio UI
- Add **Audio** section in `StudioSettings.tsx` (or new `AudioPanel.tsx`):
  - **Background Music** — file upload (`.mp3`, `.wav`, `.ogg`, max 10MB) with upload-to-R2 flow
  - **Voiceover** — same upload flow, separate track
  - Volume sliders + fadeIn/fadeOut number inputs + loop toggle
  - Waveform visualisation (basic `AnalyserNode` bars)

#### Preview (`VideoPreview.tsx`)
- Create `AudioContext` + `AudioBufferSourceNode` from signed R2 URL
- Sync play/pause with canvas RAF loop
- Apply volume/fade via `GainNode`

#### Export (`video-exporter.ts`)
- Fetch audio buffer from R2 URL
- Mix via Web Audio API into an `AudioContext` connected to a `MediaStreamDestination`
- Combine video track + audio track in `mp4-muxer` using `AudioEncoder` (AAC)

#### API (`api/src/routes/studio.ts`)
- Add `POST /api/studio/audio-upload` — multipart, stores in R2, returns `{ r2Key, url }`

**Effort:** L · **Priority:** High (core "professional video" differentiator)

---

### S4 — Image & Graphic Asset Support

**Current behaviour:** `image` node type is declared in `SceneNodeType` enum but `drawNode()` has no case for it — images silently don't render.

**Required implementation:**

#### Types (`video-script.ts`)
```ts
interface SceneScript {
  // ... existing
  assets?: SceneAsset[]
}
interface SceneAsset {
  id: string
  type: "image" | "logo" | "icon" | "shape"
  src?: string          // R2 URL for uploaded images
  shape?: "rect" | "circle" | "line" | "arrow"
  x: number             // % of canvas width (0–100)
  y: number             // % of canvas height (0–100)
  width: number         // % of canvas width
  height: number        // % of canvas height
  opacity: number
  borderRadius?: number
  color?: string        // for shapes
  animation?: AnimationSpec
}
```

#### Renderer (`canvas-nodes.ts`)
```ts
case "image": {
  const img = imageCache.get(node.src)
  if (img) ctx.drawImage(img, x, y, w, h)
  break
}
```
- `imageCache`: `Map<string, HTMLImageElement>` pre-loaded before render loop starts
- `preloadImages(compiledVideo)` call in `VideoPreview.tsx` before first frame

#### UI — Asset Panel in `StoryboardEditor.tsx`
- **+ Add Asset** button per scene card → opens mini asset drawer:
  - Upload image (JPEG/PNG/SVG, max 5MB) → uploads to R2
  - Choose built-in icon (Lucide icon picker, ~30 curated icons)
  - Add geometric shape (rect, circle, line)
- Asset thumbnail grid showing assets on the scene
- Click asset → open position/size/opacity controls (x%, y%, w%, h% inputs)
- Delete button per asset

**Effort:** L · **Priority:** Medium

---

### S5 — Typewriter Animation (Fix)

**Current behaviour:** `typewriter` animation type is declared but renders as a plain `fadeIn` alpha transition. No character-by-character reveal.

**Required fix in `canvas-nodes.ts`:**
```ts
if (animation.type === "typewriter") {
  const charCount = Math.floor(text.length * progress)
  ctx.fillText(text.slice(0, charCount), x, y)
} else {
  ctx.fillText(text, x, y)
}
```
Expose `animationType` down to `drawNode()` so it can branch on it.

**Effort:** S · **Priority:** Medium

---

### S6 — Transition Style Selection

**Current behaviour:** Transitions between scenes are always a 0.25s crossfade baked into `frame-renderer.ts`. The `VideoTheme.transition` field (`"cut" | "fade" | "slide" | "cinematic-fade"`) is declared but **only `"fade"` is implemented**.

**Required implementation in `frame-renderer.ts`:**

| Transition | Implementation |
|---|---|
| `cut` | No blend — instant scene switch |
| `fade` | Alpha blend out/in (existing) |
| `slide` | Translate previous scene off-left while next enters from right |
| `cinematic-fade` | Fade via black mid-frame (goes to black, then into new scene) |

Add transition type to `StudioSettings.tsx` → Theme section → dropdown.

**Effort:** S · **Priority:** Medium

---

### S7 — Color Palette & Theme Editor

**Current behaviour:** Theme colors are fixed in the template JSON. There is no UI to change colors once a template is loaded.

**Required additions in `StudioSettings.tsx` → "Theme" accordion (new):**
- **Color palette**: 4 color swatches (using browser `<input type="color">` or a simple hex input) mapped to `theme.colorPalette[0–3]`
- **Background style**: dropdown — Gradient / Dark Tech Grid / Particles / Solid
- **Transition**: dropdown (linked to S6)
- **Font family**: dropdown — Inter / Roboto / Montserrat / Playfair Display

Any change → re-calls `recompile(script)` immediately.

**Effort:** S · **Priority:** Medium

---

### S8 — Scene Effects (Blur, Glow, Vignette)

**Current behaviour:** `effects` array on `SceneScript` is declared (`blur`, `glow`, `vignette`) but `canvas-nodes.ts` / `frame-renderer.ts` have no rendering logic for them.

**Required implementation in `frame-renderer.ts` post-render pass:**

| Effect | Canvas API |
|---|---|
| `blur` | `ctx.filter = 'blur(Xpx)'` around specific layers |
| `glow` | `ctx.shadowBlur + ctx.shadowColor` on text nodes |
| `vignette` | Radial gradient overlay: transparent center → semi-black edges |

Add effects checkboxes per scene card in `StoryboardEditor.tsx`.

**Effort:** S · **Priority:** Low

---

### S9 — Undo / Redo

**Current behaviour:** Every scene edit immediately mutates state with no history. One wrong keystroke destroys the AI-generated script.

**Required:**
- `useScriptHistory` hook: `history: VideoScript[]`, `historyIndex: number`
- `pushHistory(script)` called before any `patchScene()` or `handleTemplateLoad()`
- `undo()` / `redo()` restore from stack (max 50 entries)
- Keyboard shortcuts: `Ctrl+Z` / `Ctrl+Shift+Z`
- Undo/Redo buttons in `StudioEditor.tsx` toolbar

**Effort:** S · **Priority:** High (prevents user frustration destroying AI output)

---

### S10 — Timeline Scrubbing

**Current behaviour:** The timeline shows proportional scene blocks but clicking/dragging on it does **not seek** the video preview. Seek only works via the playback time input in `StudioPreview.tsx`.

**Required:**
- `onTimelineClick(e)` in `TimelineEditor.tsx` → calculate clicked `time = (x/width) * totalDuration` → call `onSeek(time)` callback
- `onSeek` wired from `StudioLayout` → `VideoPreview` → sets `currentTime`
- Add drag-to-scrub: `onMouseMove` while `mousedown`

**Effort:** XS · **Priority:** Medium

---

### S11 — Scene Drag-Reorder *(existing Gap 1)*

Already documented above. Add `@dnd-kit/sortable` to `StoryboardEditor.tsx` and recalculate `start` times after drop.

**Effort:** S · **Priority:** Medium

---

### Updated Gap Summary Table

| # | Area | Gap | Effort | Priority | Status |
|---|---|---|---|---|---|
| S1 | Template UX | Selecting template doesn't redirect to prompt tab | S | High | ✅ Done |
| S2 | Storyboard | Skills shown as comma string, not individual chips | S | High | ✅ Done |
| S3 | Audio | No audio track support (upload, preview, export) | L | High | ❌ Open |
| S4 | Assets | Image/graphic nodes declared but not rendered | L | Medium | ⚠️ Partial |
| S5 | Animation | Typewriter animation renders as plain fade | S | Medium | ✅ Done |
| S6 | Transitions | Only fade implemented; cut/slide/cinematic-fade missing | S | Medium | ✅ Done |
| S7 | Theme | No color/font/background UI — locked to template defaults | S | Medium | ✅ Done |
| S8 | Effects | Blur/glow/vignette effects declared, not rendered | S | Low | ❌ Open |
| S9 | Editing UX | No undo/redo — single mis-edit destroys AI output | S | High | ✅ Done |
| S10 | Timeline | Click/drag timeline doesn't seek preview | XS | Medium | ✅ Done |
| S11 | Storyboard | Scene drag-reorder not implemented | S | Medium | ✅ Done |
| S12 | Interview | Mock fallback ignores JD | XS | High | ✅ Done |
| S13 | Interview | LLM prompt not JD-personalised | S | High | ✅ Done |
| S14 | Interview | No session history UI | M | Medium | ❌ Open |
| S15 | LinkedIn | UTM params missing on share links | XS | Low | ❌ Open |
| S16 | LinkedIn | View count not incremented on public view | S | Medium | ❌ Open |
| S17 | Profile | No vanity username URLs | M | Medium | ❌ Open |
| S18 | Profile | Resume not shown on public profile | S | Low | ❌ Open |

---

### Recommended Sprint Order (Revised — updated 2026-03-17)

**Sprint 1 — Studio Core ✅ COMPLETE**
- S9 Undo/redo ✅ · S1 Template UX ✅ · S2 Skills chips ✅ · S7 Theme editor ✅ · S10 Timeline ✅

**Sprint 2 — Studio Rich Media (next)**
1. S3 — Audio support (background music + voiceover) — biggest differentiator
2. S4 — Full image asset panel (per-scene logo/photo upload)
3. S8 — Effects (blur/glow/vignette) — visual polish

**Sprint 3 — Interview & Profile**
4. S14 — Session history UI
5. S16 — View count increment
6. S17 — Vanity username URLs
7. S15 + S18 — UTM params, resume on public profile

---

## Gap Analysis — PRD Review (2026-03-16)

> Reviewed against investor-ready PRD. Status: ✅ Done · ⚠️ Partial · ❌ Missing

### Feature 1 — AI Video Studio

| Requirement | Status | Notes |
|---|---|---|
| Job description / role input | ✅ | `SetupStep` captures JD |
| AI-generated video script | ✅ | OpenRouter → VideoScript DSL |
| Scene graph renderer (Canvas 2D) | ✅ | `SceneGraphRenderer` |
| WebCodecs MP4 export | ✅ | `mp4-muxer` pipeline |
| Drag-and-drop scene reorder | ❌ | **Gap 1** — scenes list is read-only |
| Scene-level edit (text/timing) | ✅ | `SceneEditor` component |

### Feature 2 — Compiler Pipeline

No actionable gaps. WebGPU deferred — see Deliberate Deferrals.

### Feature 3 — LinkedIn Sharing & Distribution

| Requirement | Status | Notes |
|---|---|---|
| Share to LinkedIn button | ✅ | OAuth + post creation |
| Download MP4 | ✅ | R2 signed URL |
| Public share link | ✅ | `/v/:videoId` route |
| View count tracking | ❌ | **Gap 3** — no increment on public view |
| Referral / UTM tracking | ❌ | **Gap 2** — share links have no UTM params |

### Feature 4 — AI Video Roast

No gaps.

### Feature 5 — Job-Specific Video Personalisation

| Requirement | Status | Notes |
|---|---|---|
| JD input captured | ✅ | `SetupStep` |
| JD passed to question generator | ⚠️ | **Gap 4** — mock fallback ignores JD entirely |
| LLM prompt enforces JD personalisation | ⚠️ | **Gap 5** — system prompt doesn't reference JD keywords |
| Tailored feedback referencing role | ❌ | Feedback prompt doesn't mention the target role |

### Feature 6 — AI Interview Practice

| Requirement | Status | Notes |
|---|---|---|
| Setup flow (JD, interview type) | ✅ | |
| AI question generation | ✅ | |
| Video recording + transcription | ✅ | MediaRecorder + Web Speech API |
| Per-answer AI scoring (5 dimensions) | ✅ | Clarity/Confidence/Structure/Relevance/Impact |
| Results dashboard + model answers | ✅ | `ResultsStep` |
| Session persistence (DB) | ✅ | `interview_sessions` + `interview_answers` tables |
| Session history UI | ❌ | **Gap 6** — no "Past Sessions" list in the UI |

### Feature 7 — Public Profiles

| Requirement | Status | Notes |
|---|---|---|
| Profile page at `/profile/:userId` | ✅ | |
| Videos listed on profile | ✅ | |
| Username / vanity URL | ❌ | **Gap 7** — only UUID-based URLs, no `/:username` route |
| Resume visible on public profile | ❌ | **Gap 8** — resume data not surfaced on public page |
| Contact / hire CTA | ✅ | Email CTA present |

---

### Gap Summary Table

| # | Feature | Gap | Effort | Priority |
|---|---|---|---|---|
| 1 | Studio | Scene drag-reorder | S | Medium |
| 2 | LinkedIn | UTM params on share links | XS | Low |
| 3 | LinkedIn | View count increment | S | Medium |
| 4 | Interview | Mock fallback ignores JD | XS | High |
| 5 | Interview | LLM prompt not JD-personalised | S | High |
| 6 | Interview | No session history UI | M | Medium |
| 7 | Public Profile | No vanity username URLs | M | Medium |
| 8 | Public Profile | Resume not on public profile | S | Low |

---

### Gap Details

**Gap 1 — Scene drag-reorder (S, Medium)**
Add `@dnd-kit/sortable` to `SceneEditor`; persist reordered `scenes[]` in local state before compile.

**Gap 2 — UTM params on share links (XS, Low)**
Append `?utm_source=linkedin&utm_medium=share&utm_campaign=hired_video` when building the share URL in the LinkedIn OAuth handler.

**Gap 3 — View count increment (S, Medium)**
Add `PATCH /api/videos/:id/view` endpoint; call it from the public video page `useEffect` on mount. Store count in `videos.viewCount` column (add migration).

**Gap 4 — Mock fallback ignores job description (XS, High)**
In `buildMockQuestions()` (`api/src/routes/interview.ts`), incorporate the `jobDescription` string into at least the first 2 mock questions so dev/demo mode feels personalised.

**Gap 5 — LLM prompt not JD-personalised (S, High)**
Update the `POST /questions` system prompt to explicitly instruct:
> "Every question must reference the specific role, company, or skills mentioned in the job description below."
Also update `POST /answers/:id/analyze` to include the JD so scores reference role fit.

**Gap 6 — Session history UI (M, Medium)**
Add a "Past Sessions" tab in `InterviewPractice.tsx` calling `GET /api/interview/sessions`, rendering a list with date, role, overall score, and a "Review" button loading the session into `ResultsStep`.

**Gap 7 — Vanity username URLs (M, Medium)**
Add `username` column to `users` (migration). Allow setting from settings page. Add `/u/:username` route. Redirect `/profile/:userId` → `/u/:username` when set.

**Gap 8 — Resume on public profile (S, Low)**
Fetch the user's latest resume from `GET /api/resumes` on the public profile page and render a "View Resume" button / inline preview section.

---

### Deliberate Deferrals

| Item | Reason |
|---|---|
| WebGPU encode acceleration | Browser baseline not stable; Canvas 2D sufficient for MVP |
| Whisper server-side transcription | Adds latency + cost; Web Speech API covers 95% of use cases |
| Native mobile app | Web PWA covers recording; native needed only post-Series A |
| ATS / recruiter integrations | Requires enterprise agreements; deferred to B2B phase |
| Real-time collaborative editing | Out of scope for solo job-seeker MVP |

---

### Recommended Sprint Order

1. **Gap 4 + 5** (XS+S, High) — JD personalisation in interview: quick wins that fix core value prop
2. **Gap 3** (S, Medium) — View count: needed for LinkedIn distribution analytics demo
3. **Gap 6** (M, Medium) — Session history: makes interview feature feel complete for demos
4. **Gap 1** (S, Medium) — Scene drag-reorder: polish for studio
5. **Gap 7** (M, Medium) — Vanity URLs: needed before influencer / press push
6. **Gap 8 + 2** (S+XS, Low) — Resume on profile + UTM params: minor polish
---

## Part 6 — AI Image Generation

### I1 — Per-Scene AI Background Images

Users can generate AI images as custom backgrounds for individual scenes using Cloudflare Workers AI. This creates richer, more visually compelling videos without requiring any design skills or external API keys.

#### Architecture

```
User types prompt in SceneCard
        ↓
POST /api/studio/generate-image  (auth required)
        ↓
Cloudflare Workers AI
  @cf/bytedance/stable-diffusion-xl-lightning
        ↓
PNG binary → base64 data URL
        ↓
SceneScript.backgroundImage stored
        ↓
scene-graph.ts emits custom:URL background node
        ↓
canvas-nodes.ts renders as cover-fit
```

#### Smart Prompt Suggestions (per scene type)

The UI pre-fills a contextual starting prompt:
- **intro**: `"Professional headshot background, modern office, soft blue gradient lighting, cinematic"`
- **achievement**: `"Abstract data visualization, glowing metrics, dark background, purple tones"`
- **skills**: `"Technology abstract, circuit board patterns, deep purple gradient, futuristic"`
- **closing**: `"Sunrise cityscape, career success, warm golden tones, inspirational"`

#### API Endpoint

`POST /api/studio/generate-image` — auth required

**Request:** `{ prompt: string }`
**Response:** `{ imageUrl: string }` — base64 `data:image/png;base64,...` URL

Uses `env.AI` Cloudflare Workers AI binding (`@cf/bytedance/stable-diffusion-xl-lightning`, 4 steps for speed).
Returns 503 with `AI_UNAVAILABLE` if the AI binding is not configured.

#### Type Change

`SceneScript.backgroundImage?: string` — when set, `scene-graph.ts` uses this as the background node content (`custom:URL`) instead of the global `video.theme.background`.

#### Tasks

- [x] **I-01** Add `[ai]` binding to `api/wrangler.toml`
- [x] **I-02** Add `AI?: Ai` to `Env` interface in `api/src/types/index.ts`
- [x] **I-03** Add `POST /api/studio/generate-image` to `api/src/routes/studio.ts`
- [x] **I-04** Add `backgroundImage?: string` to `SceneScript` in `frontend/types/video-script.ts`
- [x] **I-05** Update `scene-graph.ts` — use `scene.backgroundImage` as background when present
- [x] **I-06** Add `backgroundImage` to `SceneScriptSchema` in `studio-service.ts`
- [x] **I-07** Add `generateImage(prompt)` to `studioService`
- [x] **I-08** Add AI image UI to `StoryboardEditor.tsx` SceneCard
