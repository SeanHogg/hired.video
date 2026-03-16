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

- [ ] **T-05** Create `frontend/lib/compiler/animation-graph.ts` — `compileAnimation()`, all easings, `evaluate(elapsed)`
- [ ] **T-06** Create `frontend/lib/compiler/scene-graph.ts` — `buildSceneGraph()`, one builder per scene type
- [ ] **T-07** Create `frontend/lib/compiler/video-compiler.ts` — `compile(script): CompiledVideo`, `getSceneAt(time)`
- [ ] **T-08** Create `frontend/lib/compiler/storyboard-adapter.ts` — `storyboardToVideoScript(sb): VideoScript`

### Phase 2 — Renderer & Exporter

- [ ] **T-09** Create `frontend/lib/renderer/canvas-nodes.ts` — `drawNode(ctx, node)` all types
- [ ] **T-10** Create `frontend/lib/renderer/frame-renderer.ts` — `render(ctx, compiledVideo, time)`
- [ ] **T-11** Create `frontend/lib/renderer/video-exporter.ts` — `exportVideo()` WebCodecs + mp4-muxer + MediaRecorder fallback
- [ ] **T-12** Install `mp4-muxer` and `webm-muxer`

### Phase 3 — Studio UI

- [ ] **T-13** Create `frontend/pages/studio/StudioLayout.tsx` — 3-panel layout, full state owner, marketing landing for anon
- [ ] **T-14** Create `frontend/pages/studio/StudioSidebar.tsx` — Create New, recent projects, templates, Roast link
- [ ] **T-15** Create `frontend/pages/studio/StudioEditor.tsx` — tab switcher with auto-switch logic
- [ ] **T-16** Create `frontend/components/PromptEditor.tsx` — resume + prompt + JD toggle + Run
- [ ] **T-17** Create `frontend/components/StoryboardEditor.tsx` — inline-editable cards, recompile on change
- [ ] **T-18** Create `frontend/components/TimelineEditor.tsx` — proportional blocks, playhead sync
- [ ] **T-19** Create `frontend/components/VideoPreview.tsx` — RAF loop, `frameRenderer.render()`, play/pause
- [ ] **T-20** Create `frontend/pages/studio/StudioPreview.tsx` — Export MP4, Publish, LinkedIn Post, visibility toggle
- [ ] **T-21** Create `frontend/pages/studio/StudioSettings.tsx` — AI + Video settings
- [ ] **T-22** Update `frontend/pages/studio/Studio.tsx` → one-line re-export
- [ ] **T-23** Add studio CSS to `frontend/global.css`

### Phase 4 — Templates

- [ ] **T-24** Create `frontend/data/templates/video-resume-professional.json`
- [ ] **T-25** Create `frontend/data/templates/video-resume-minimal.json`

### Phase 5 — Backend

- [x] **T-26** Update `api/src/routes/studio.ts` — real OpenRouter LLM, `VideoScript` output, `jobDescription` support, fallback to mock
- [ ] **T-27** Add `POST /api/studio/edit-script` — AI surgical editing endpoint
- [ ] **T-28** Create `api/src/routes/linkedin-post.ts` — `POST /api/studio/linkedin-post`
- [ ] **T-29** Wire new routes into `api/src/app.ts`

### Phase 6 — Growth Features

- [ ] **T-30** Create `frontend/components/LinkedInPostModal.tsx`
- [ ] **T-31** Add LinkedIn Post button to `StudioPreview.tsx`
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

- [ ] **T-44** Verify `App.tsx` route works end-to-end with new Studio re-export
- [ ] **T-45** Smoke test: resume paste → Run → preview → Export MP4 → Publish → public page → LinkedIn post

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