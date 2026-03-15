# hired.video — Studio Upgrade Spec & Task List

## Overview

Replace the existing 5-step wizard UI at `/studio` with a **Google AI Studio–style creative workspace**. The backend remains unchanged. The frontend is rebuilt as a modular three-panel layout with live canvas preview, WebCodecs video export, and an editable storyboard.

---

## Current State

| Item | Status |
|---|---|
| `/studio` route | Wizard (5 linear steps) |
| Storyboard generation | `POST /api/studio/storyboard` — mock only |
| Video recording | Canvas 2D + MediaRecorder → WebM blob |
| Publish | Upload → fake YouTube ID → poll |
| LLM | `OPENROUTER_API_KEY` secret exists, **never called** |

---

## Target Architecture

```
StudioLayout (top-level state owner)
├── StudioSidebar          ← project nav + create new
├── StudioEditor           ← tabbed center panel
│     ├── PromptEditor     ← textarea + Run button → calls API
│     ├── StoryboardEditor ← editable scene cards
│     └── TimelineEditor   ← visual drag timeline
└── Right Panel
      ├── StudioSettings   ← model, temp, resolution
      └── StudioPreview    ← live canvas renderer
            └── VideoPreview (canvas component)
```

### File Layout

```
frontend/pages/studio/
  StudioLayout.tsx       ← replaces Studio.tsx as the main export
  StudioSidebar.tsx
  StudioEditor.tsx
  StudioPreview.tsx
  StudioSettings.tsx

frontend/components/
  PromptEditor.tsx
  StoryboardEditor.tsx
  TimelineEditor.tsx
  VideoPreview.tsx

frontend/lib/services/
  studio-service.ts      ← extend (add prompt field, model/temp params)

frontend/types/
  studio.ts              ← shared TS types for the studio domain
```

`App.tsx` lazy-import stays the same (`./pages/studio/Studio`) — `Studio.tsx` becomes a re-export of `StudioLayout`.

---

## Layout & CSS

Three-column layout using CSS Grid or Flexbox.

```
┌──────────┬──────────────────────────┬──────────────────┐
│ Sidebar  │       Editor             │  Settings        │
│  260px   │       flex-1             │  320px           │
│          │  [Prompt|Storyboard|     ├──────────────────┤
│          │   Timeline]              │  Preview         │
│          │                          │  (canvas 16:9)   │
└──────────┴──────────────────────────┴──────────────────┘
```

CSS classes (Tailwind utility-based):
- `.studio-layout` → `flex h-screen overflow-hidden`
- `.studio-sidebar` → `w-[260px] flex-shrink-0 border-r overflow-y-auto`
- `.studio-editor` → `flex-1 min-w-0 overflow-y-auto`
- `.studio-right-panel` → `w-[320px] flex-shrink-0 border-l flex flex-col`

The existing app-level `Navigation` / `Sidebar` layout wrappers are **removed** inside Studio — it takes the full viewport.

---

## Component Specs

### `StudioLayout.tsx`

Top-level state owner. No wizard steps.

**State:**
```ts
project: {
  id?: string
  name: string
  prompt: string
  resumeText: string
  storyboard: Storyboard | null
  videoBlob: Blob | null
  projectId: string | null
  youtubeVideoId: string | null
  status: string
  model: string         // e.g. "google/gemini-flash-1.5"
  temperature: number   // 0–1
  resolution: "720p" | "1080p"
}
```

Passes `project` + `setProject` down to all children.

Unauthenticated users see the existing marketing landing (extracted from `Studio.tsx`).

---

### `StudioSidebar.tsx`

Left navigation panel.

**Sections:**
- **+ Create New** button → resets `project` to blank
- **Projects** heading
  - Recent (calls `studioService.getProjects()` on mount)
  - Templates (static list — future)
- **Library** heading
  - My Videos
  - Starred

Each recent project row shows: name, status badge, date.  
Clicking a project loads it into `project` state.

---

### `StudioEditor.tsx`

Center tabbed workspace.

**Tabs:** `Prompt` | `Storyboard` | `Timeline`

Auto-switches to `Storyboard` tab after AI generation completes.  
Auto-switches to `Timeline` tab when user clicks a scene card.

---

### `PromptEditor.tsx`

**Fields:**
- Resume text `<textarea>` (paste/type resume)
- Prompt `<textarea>` (e.g. "Create a 30s video for a senior engineer")
- **Run** button

**On Run:**
1. Calls `studioService.generateStoryboard({ resumeText, prompt, model, temperature })`
2. Shows loading spinner + "Generating storyboard…" text
3. On success → updates `project.storyboard`, auto-switches editor to `Storyboard` tab
4. On error → shows toast

---

### `StoryboardEditor.tsx`

Displays 4 scene cards in a 2×2 grid.

**Each card shows:**
- Scene type badge (`intro` / `achievement` / `skills` / `closing`)
- `title` (editable inline)
- `subtitle` (editable inline)
- `text` or `skills[]` (editable)
- `duration` (number stepper, min 3s max 30s)
- Color swatch from `style.color_palette`

**Edits flow back** into `project.storyboard` via `setProject`.

If no storyboard: empty state with "Run Prompt to generate storyboard".

---

### `TimelineEditor.tsx`

Visual horizontal timeline of scenes.

```
|◀──── Intro (8s) ────▶|◀── Achievements (10s) ──▶|◀ Skills (8s) ▶|◀ Closing (5s) ▶|
0s                     8s                          18s             26s              31s
```

Each block width = `scene.duration * 20px`.  
Clicking a block focuses that scene in `StoryboardEditor`.  
Duration label shown inside block.

Future: drag-resize handles.

---

### `StudioPreview.tsx`

Right-panel preview area.

Shows:
- `<VideoPreview>` canvas (960×540 or 1080p scaled to fit)
- **Play / Pause** button
- **Export Video** button → triggers WebCodecs export
- **Publish** button → triggers upload + publish flow (reuses existing backend)
- Progress bar when exporting or publishing

If no storyboard: placeholder "Run prompt to preview".

---

### `VideoPreview.tsx`

Canvas-based renderer. Reuses the existing `renderScene()` logic from `Studio.tsx`.

**Props:**
```ts
{
  storyboard: Storyboard
  playing: boolean
  onTimeUpdate?: (elapsed: number) => void
}
```

**Behaviour:**
- RAF loop driven by `performance.now()`
- `playing` toggles the loop on/off
- Loops back to start when all scenes complete
- `onTimeUpdate` fires every frame for timeline scrubber sync

**WebCodecs Export (offline render):**

```
exportVideo(storyboard, resolution) → Promise<Blob>
```

Pipeline:
1. Determine total frames = `totalDuration * 30`
2. For each frame:
   - Compute `elapsed` time
   - Call `renderScene()` on offscreen canvas
   - `canvas.transferToImageBitmap()` → `new VideoFrame(bitmap, { timestamp })`
   - `encoder.encode(frame)` (VideoEncoder, codec `avc1.42E01E` or `vp09.00.10.08`)
3. Collect encoded chunks via `output` callback into `Uint8Array[]`
4. Mux into MP4 using `mp4-muxer` (or fallback to WebM via `webm-muxer`)
5. Return `Blob` with `type: "video/mp4"` (or `video/webm`)

Fallback: if `VideoEncoder` is not available, fall back to existing `MediaRecorder` approach.

**Feature detection:**
```ts
const supportsWebCodecs = typeof VideoEncoder !== "undefined";
```

---

### `StudioSettings.tsx`

Right-panel settings accordion.

**AI Settings section:**
```
Model       <select> gemini-flash-1.5 | gpt-4o-mini | claude-3-haiku
Temperature <range 0–1 step 0.1>
Top P       <range 0–1 step 0.05>  (hidden by default, expand toggle)
Max Tokens  <number input 256–4096>
```

**Video Settings section:**
```
Resolution  <select> 720p (960×540) | 1080p (1920×1080)
Aspect Ratio <select> 16:9 | 9:16 | 1:1
Duration    <select> 15s | 30s | 60s  (sets targetDuration hint to API)
```

All values stored in `project` state and passed to API on Run.

---

## Types (`frontend/types/studio.ts`)

```ts
export interface StudioProjectState {
  id?: string
  name: string
  prompt: string
  resumeText: string
  storyboard: Storyboard | null
  videoBlob: Blob | null
  projectId: string | null
  youtubeVideoId: string | null
  status: "idle" | "generating" | "ready" | "exporting" | "uploading" | "publishing" | "done" | "error"
  model: string
  temperature: number
  resolution: "720p" | "1080p"
  aspectRatio: "16:9" | "9:16" | "1:1"
  targetDuration: number
}
```

---

## Service Layer (`studio-service.ts`)

Extend existing service with:

```ts
generateStoryboard({
  resumeText: string,
  prompt?: string,
  model?: string,
  temperature?: number,
  targetDuration?: number
}) → Promise<ApiSuccessResponse<Storyboard>>
```

Also expose:
- `getProjects()` — already exists
- `uploadVideo(blob, title)` — already exists
- `publishVideo(projectId, opts)` — already exists
- `getProjectStatus(id)` — already exists

---

## API Changes (`api/src/routes/studio.ts`)

### Replace `buildMockStoryboard` with real LLM call

```
POST /api/studio/storyboard
Body: { resumeText, prompt?, model?, temperature?, targetDuration? }
```

**LLM call using OpenRouter:**
- Read `OPENROUTER_API_KEY` from env
- `POST https://openrouter.ai/api/v1/chat/completions`
- Model: body `model` param, default `google/gemini-flash-1.5`
- System prompt: extract name/role/achievements/skills from resume
- Response format: `{ type: "json_object" }`
- Parse + validate with `StoryboardSchema.safeParse()`
- **Fallback**: if key missing or call fails → `buildMockStoryboard()`

**Prompt template:**
```
You are a video resume scriptwriter. Given a resume, produce a JSON storyboard with exactly 4 scenes.

Extract from the resume:
- Candidate name
- Most recent job title / role
- 2-3 achievements with metrics
- 4-6 key skills

Return ONLY valid JSON:
{
  "style": { "theme": "professional", "color_palette": ["#hex","#hex","#hex"], "font_style": "Inter" },
  "scenes": [
    { "type":"intro",        "title":"<Name>",             "subtitle":"<Role>",        "visual":"...", "camera":"close-up", "duration":5 },
    { "type":"achievement",  "title":"Key Achievements",   "text":"<metric bullets>",  "visual":"...", "camera":"medium",   "duration":10 },
    { "type":"skills",       "title":"Core Skills",        "skills":["..."],           "visual":"...", "camera":"wide",     "duration":8 },
    { "type":"closing",      "title":"Let's Connect",      "text":"<CTA sentence>",    "visual":"...", "camera":"static",   "duration":5 }
  ]
}

Resume:
{{resumeText}}
```

---

## App.tsx

No route changes needed. `Studio.tsx` becomes a re-export:

```ts
// frontend/pages/studio/Studio.tsx
export { default } from "./StudioLayout";
```

---

## CSS / Tailwind

Add to `global.css`:
```css
.studio-layout { @apply flex h-screen overflow-hidden bg-background; }
.studio-sidebar { @apply w-[260px] flex-shrink-0 border-r bg-card overflow-y-auto flex flex-col; }
.studio-editor  { @apply flex-1 min-w-0 overflow-y-auto flex flex-col; }
.studio-right-panel { @apply w-[320px] flex-shrink-0 border-l flex flex-col overflow-y-auto; }
```

---

## Dependencies

| Package | Purpose | Already installed? |
|---|---|---|
| `mp4-muxer` or `webm-muxer` | Mux WebCodecs chunks | Likely no — add to `frontend/package.json` |
| `jszip` | DOCX parsing (already used in Studio.tsx) | Yes |
| `framer-motion` | Already used | Yes |
| `lucide-react` | Already used | Yes |

---

## Task List

### Phase 1 — Types & Service

- [ ] **T-01** Create `frontend/types/studio.ts` with `StudioProjectState` type
- [ ] **T-02** Update `frontend/lib/services/studio-service.ts` — extend `generateStoryboard` to accept `{ resumeText, prompt, model, temperature, targetDuration }`

### Phase 2 — Core Layout

- [ ] **T-03** Create `frontend/pages/studio/StudioLayout.tsx` — full viewport layout, state owner, auth gate (marketing page for unauthenticated)
- [ ] **T-04** Create `frontend/pages/studio/StudioSidebar.tsx` — Create New, project list from API, nav sections
- [ ] **T-05** Update `frontend/pages/studio/Studio.tsx` → re-export `StudioLayout`

### Phase 3 — Editor Components

- [ ] **T-06** Create `frontend/components/PromptEditor.tsx` — resume textarea, prompt textarea, Run button with loading state
- [ ] **T-07** Create `frontend/components/StoryboardEditor.tsx` — 2×2 editable scene cards, inline editing, duration stepper
- [ ] **T-08** Create `frontend/components/TimelineEditor.tsx` — horizontal scene blocks, duration labels, click-to-focus
- [ ] **T-09** Create `frontend/pages/studio/StudioEditor.tsx` — tab switcher rendering the 3 editor components

### Phase 4 — Preview & Settings

- [ ] **T-10** Extract `renderScene()` from `Studio.tsx` into `frontend/lib/studio-renderer.ts` (shared between preview and export)
- [ ] **T-11** Create `frontend/components/VideoPreview.tsx` — canvas RAF loop, play/pause, reuses `renderScene`
- [ ] **T-12** Add WebCodecs export function `exportVideo()` to `VideoPreview.tsx` (with MediaRecorder fallback)
- [ ] **T-13** Create `frontend/pages/studio/StudioPreview.tsx` — wraps VideoPreview, Play/Pause, Export, Publish controls
- [ ] **T-14** Create `frontend/pages/studio/StudioSettings.tsx` — AI + Video settings panels

### Phase 5 — API (Backend)

- [ ] **T-15** Update `api/src/routes/studio.ts` — replace `buildMockStoryboard()` with real OpenRouter LLM call; accept `prompt`, `model`, `temperature` in request body; fallback to mock on error

### Phase 6 — CSS & Wiring

- [ ] **T-16** Add studio layout CSS to `frontend/global.css`
- [ ] **T-17** Install `mp4-muxer` (or `webm-muxer`) in `frontend/package.json`
- [ ] **T-18** Verify `App.tsx` route still works with new `Studio.tsx` re-export
- [ ] **T-19** End-to-end smoke test: create project → run prompt → preview renders → export → publish flow

---

## Out of Scope (Future)

- Real YouTube Data API OAuth (currently fake ID)
- PDF client-side text extraction (currently user must paste)
- Drag-resize timeline handles
- Scene reordering drag-and-drop
- WebGPU shader-based scene rendering (current Canvas 2D is the starting point)
- Collaborative editing
