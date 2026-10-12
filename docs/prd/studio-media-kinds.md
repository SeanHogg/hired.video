# PRD — Studio Media Kinds (Video / Podcast / Voice / Animation)

**Owner:** hired.video Studio
**Status:** Phase 1 (foundation) landed 2026-05-21 — `mediaKind` axis live on `TemplateDef` + `studio_projects` + StudioProject DTO. Phases 2–5 outlined below.
**Tracking:** Consolidated Gap Register **#894** (foundation), **#899** (audience taxonomy — parallel-safe, also landed), **#900 / #901** (per-audience + per-template landing pages — gated on this PRD).
**Surfaces:**
- `/studio` template chooser (TEMPLATE_CATALOG)
- `/studio/:id` editor (StudioEditorV2, save/export menu)
- `studio_projects` table (`media_kind` column)
- Marketing landing pages (`/for/:audience`, `/templates/:slug` — pending)

---

## 0. Strategic framing

The studio is a **canvas product**, not a video product. Its architectural primitive is "open a canvas runtime, give the user kind-appropriate tools, persist the work, render to a kind-appropriate output." The Timeline + CanvasState happens to be the runtime for time-based composition (video / audio / animation) — but the `mediaKind` axis is the first-class extensibility hook for ANY canvas runtime the studio grows to host.

Each kind self-describes FOUR things — the same four-tuple the user articulated as the architectural commitment:

1. **Canvas runtime** — what editor surface mounts (Timeline + widgets for video kinds; game engine / CAD viewer / page-graph for non-linear kinds)
2. **Actions / tools** — the toolset the canvas exposes (place widget vs place sprite vs draw dimensioned line vs add choice node)
3. **Metadata** — what's persisted on the project row (episode # for podcast, build target for game, units + tolerances for CAD)
4. **Save / export / publish** — the output pipeline (MP4 for video, HTML5 bundle for game, STL/STEP for CAD, EPUB3 for interactive comic)

The currently-shipping kinds + a sampling of kinds the architecture supports as future canvas runtimes:

| Kind | Canvas runtime | Scene shape | Primary output | Status |
|---|---|---|---|---|
| `video` | Timeline + CanvasState widgets | N scenes = N time slices | MP4 / MOV / WebM | ✅ Shipping |
| `podcast` | Timeline (audio-first view) | N scenes = N chapters | MP3 / M4A + RSS | ✅ Shipping (Phase 2) |
| `voice` | Timeline (audio-only) | N scenes = N reads / sections | MP3 / WAV / Opus | ✅ Shipping (Phase 4) |
| `animation` | Timeline (loop-aware) | N scenes = N keyframe groups | GIF / WebP / APNG / transparent MP4 | 🟡 Phase 5 |
| **`image`** | Raster editor (canvas + layers) | **1 scene** (the workspace) | PNG / JPG / WebP / SVG | 🔵 Future canvas runtime (#932) |
| **`game`** | Game engine surface (Phaser / Three.js) | N scenes = N levels / state-graph nodes | HTML5 bundle / itch.io ZIP / web embed | 🔵 Future canvas runtime (#927) |
| **`cad`** | 3D viewer (Three.js / replicad) OR 2D drafting (Konva) | **1 scene** (the workspace) | STL / STEP / DXF / PDF | 🔵 Future canvas runtime (#930) |
| **`interactive_comic`** | Page-graph editor | N scenes = N pages (branching edges between) | EPUB3 / CBR / hosted reader | 🔵 Future canvas runtime (#929) |
| **`animated_film`** | Rig-aware editor (Spine / DragonBones) | N scenes = N shots | MP4 / MOV | 🔵 Future canvas runtime (#928) |
| **`xr_scene`** / **`3d_model`** | A-Frame / mesh editor | varies | glTF / USDZ / OBJ / FBX | 🔵 Future canvas runtime |

The user's framing that locked this in: *"Games should not be out of scope. It's a studio, it has a canvas, our type definition should load the appropriate canvas. … The type defines the actions, the metadata, etc. The publication/save/export/publish is the rendered output."* Plus the follow-on: *"The scene would be 1 scene and the center canvas would be a CAD canvas. Users also want the ability to create images like photoshop … Give them all the tools in 1 studio."*

Three commitments that flow from this:

1. **Scene shape rebases per runtime.** Today's "scene" semantics (one time slice) is Timeline-specific. Static-output kinds (image, CAD) degenerate to a single workspace scene. Interactive kinds use scenes as state-graph nodes. The shared shell (title / save / export / AI Assistant / Layers chrome) stays — the center swaps.
2. **`image` is a first-class canvas kind.** Photoshop-shaped raster authoring inside the studio, not a separate product. Closes the "asset author" gap that today forces users to leave for Photoshop / Figma / Procreate.
3. **Closed-loop asset interop.** Assets authored in ANY canvas (a generated image, a CAD part, a voice clone, a music bed) land in the user's R2 asset library and are importable into any other canvas project via the existing `MediaPicker`. "All tools in 1 studio" means the asset flow is internal — no leave-the-app trip for sourcing.

---

## 1. Architecture

### 1.1 The orthogonal axes

Studio projects now carry **three** axes that consumers may filter or branch on. They are deliberately orthogonal — adding a value to one does NOT require touching the others:

| Axis | Field | Values | Meaning |
|---|---|---|---|
| Storage | `studio_projects.kind` | `'scene' \| 'nle'` | Which editor surface authored the row + which JSONB column to read (`storyboard` vs `timeline_spec`). Internal detail; future non-Timeline canvas runtimes (game, CAD, comic) will add their own values here pointing at new JSONB columns (`game_state`, `cad_state`, etc.). |
| **Canvas / output kind** | `studio_projects.media_kind` | `'video' \| 'podcast' \| 'voice' \| 'animation'` *(today)* — extensible to `'game' \| 'cad' \| 'interactive_comic' \| 'xr_scene' \| '3d_model' \| …` | **First-class extensibility hook.** Drives FOUR things: which canvas runtime mounts in the editor, which toolset the runtime exposes, which metadata the project row carries, and which export / publish pipelines run. Single SoT every layer reads (editor, save menu, marketing landing pages, project-card badges). |
| Purpose | `_purpose` in storyboard JSONB | `STUDIO_PURPOSES` enum | LLM prompt config for the script generator (resume / job_ad / personal_brand / etc.). |

Existing axes that remain orthogonal too:

- **`TemplateDef.category`** — `'promote' \| 'showcase' \| 'hiring' \| 'film' \| 'quick'` — intent bucket for the /studio filter pills.
- **`TemplateDef.audiences[]`** — `Audience[]` (athletes, actors, musicians, …) — demographic. SSoT for #900 audience landing pages + #901 template-page "best for" chips.

**Per the standing DRY rule:** consumers self-gate by reading these fields directly. Never pass `canPublishToYouTube` or `canExportMp3` booleans through component props — the export menu calls `outputProfilesFor(mediaKind)` and the publish list calls `publishDestinationsFor(mediaKind)`. Shared components decide their own visibility.

### 1.2 Canvas runtimes — Timeline is ONE of N

Today the studio ships exactly one canvas runtime — the Timeline + CanvasState widget composer at [shared/timeline.ts](../../hired.video/shared/timeline.ts). It hosts every currently-shipping kind because video / podcast / voice / animation all share the same time-based-composition shape:

- **v1 / v2 / v3** video tracks (background / widget overlays / scene-post effects)
- **a1 / a2** audio tracks (music + voiceover)
- **`markers[]`** — fungible cue points; podcast chapters slot in with zero schema change
- **`multicamGroups`** — multi-host video podcast comes for free
- **`ClipEffect`** registry — `audio-eq / audio-compressor / audio-limiter` from the M2/M5 effect catalog ARE the podcast audio chain

The render facade ([render.ts](../../hired.video/frontend/lib/timeline/render.ts)) routes between WebCodecs / ffmpeg.wasm / audio-only strategies via [`pickRenderEngine`](../../hired.video/shared/timeline.ts) — but its contract is `Timeline → output Blob`, which is Timeline-runtime-specific.

**Future canvas runtimes** plug in at the SAME extensibility seam as the Timeline does today. Each runtime owns:

- Its own state model (game state graph, CAD BREP, comic page-graph) — persisted to a kind-specific JSONB column on `studio_projects` parallel to today's `timeline_spec`
- Its own editor surface (a `<GameStage/>`, `<CADStage/>`, `<ComicStage/>` component that swaps in for `<CanvasStage/>` when `mediaKind` selects it)
- Its own render / export facade (Phaser → HTML5 bundle, Three.js → glTF / STL, page-graph → EPUB3) — alongside today's Timeline render facade
- Its own `outputProfilesFor(kind)` + `publishDestinationsFor(kind)` entries in `@shared/media-kinds`

The kind axis is the dispatch table. Nothing else needs to know whether a project is "linear Timeline" or "branching game graph" — that's the canvas runtime's internal detail.

---

## 2. Per-kind contracts

Each mediaKind self-describes four things via `@shared/media-kinds.ts`:

### 2.1 Output profiles (`outputProfilesFor(kind)`)

| Kind | Profiles (free → Pro) |
|---|---|
| `video` | H.264 (MP4), H.265 (MP4)*, ProRes 422 (MOV)*, DNxHD (MOV)*, VP9 (WebM)* |
| `podcast` | MP3 with chapters, M4A / AAC, Opus (OGG)*, WAV (lossless)*, **Video podcast (MP4)** |
| `voice` | MP3, WAV, Opus (OGG)* |
| `animation` | GIF, Animated WebP, APNG*, **MP4 transparent*** |

\* = Pro-gated via the existing `useSubscription().isPro` predicate.

### 2.2 Publish destinations (`publishDestinationsFor(kind)`)

| Kind | Destinations |
|---|---|
| `video` | YouTube, LinkedIn, Profile |
| `podcast` | RSS feed, Apple Podcasts Connect, Spotify for Creators, YouTube (video podcast), LinkedIn (video podcast), Profile |
| `voice` | Voice marketplace, Profile audio embed, Profile |
| `animation` | Giphy, Tenor, Hosted CDN link, Profile |

Each destination flags `requiresRender: boolean` so the dropdown row self-disables before the project has a baked output.

### 2.3 Save-context metadata

Diverges per kind. The editor's Details drawer renders a kind-specific section that writes to the storyboard JSONB:

- **video** — title, slug, meta description, social card image (already shipping)
- **podcast** — episode number, season, show notes (long-form md), chapter list (writes to `timeline.markers[]`), artwork 3000×3000, host names
- **voice** — script, voice-clone-id, language, gender, tags
- **animation** — loop frame count, target FPS, transparent BG flag

### 2.4 Editor preferred view

- **video** — Canvas-first (current default)
- **podcast** — Waveform-first AudioTimeline with chapter markers as first-class clickable items
- **voice** — Script-input + voice-picker, optional simple visualizer
- **animation** — Canvas at target loop length with onion-skin overlay

---

## 3. Phasing

### Phase 1 — Foundation (landed 2026-05-21)

**Goal:** every consumer can read a project's mediaKind and derive its output profiles + publish destinations without an editor surface yet existing for new kinds.

- ✅ `shared/media-kinds.ts` — SSoT for the enum, `OutputProfile[]`, `PublishDestination[]`, per-kind UI hints
- ✅ `TemplateDef.mediaKind: MediaKind` field — every existing template tagged `'video'`
- ✅ `TemplateDef.audiences: Audience[]` field — every existing template audience-tagged (#899)
- ✅ `frontend/components/studio/templates/audiences.ts` — `Audience` taxonomy registry
- ✅ `studio_projects.media_kind` column + CHECK constraint + partial index (migration `0099_studio_projects_media_kind.sql`)
- ✅ `mediaKind` surfaced on the StudioProject DTO + accepted on `POST /api/studio/save-draft`
- ✅ `mediaKind` plumbed through frontend `StudioProject` schema + `saveDraft()` helper
- ✅ API + frontend typecheck clean

### Phase 2 — Podcast MVP (partially landed 2026-05-21)

**Goal:** ship the first non-video kind end-to-end. Validates the foundation against the hardest case (audio-first, chapter authoring, RSS publish).

**Shipped:**
- ✅ `TEMPLATE_CATALOG` gains `podcast_trailer / podcast_episode / podcast_interview` entries with `mediaKind: 'podcast'`
- ✅ New `podcaster` + `educator` audiences in the taxonomy
- ✅ Audio-only render strategy ([audio-only-render.ts](../../hired.video/frontend/lib/timeline/audio-only-render.ts)) — emits stereo 48 kHz WAV via the existing `renderTimelineAudio()` + `audioBufferToWav()` pipeline
- ✅ `pickRenderEngine` gains an `audio-only` branch via `isAudioOnly(timeline)` (Timeline-shape predicate, not mediaKind-aware so a video project the user emptied of v-tracks falls through correctly)
- ✅ `StudioSaveMenuV2` DRY-ified: reads `MEDIA_KIND_UI[mediaKind].exportVerb` for the export label + iterates `publishDestinationsFor(mediaKind)` for publish rows; caller passes a flat `publishHandlers: Partial<Record<PublishDestinationId, () => void>>` map (no prop-drilled `canPublishToYouTube` booleans)
- ✅ `template-seeds.ts` gains podcast seeds — each scene label authored as a future chapter cue ("01 · Cold open", "02 · Welcome", …) so the canvas-to-timeline emitter can project them onto `timeline.markers[]` in the chapter-editor pass
- ✅ `useCreateStudioDraft` carries `template.mediaKind` to `saveDraft` on first save so podcast projects persist as `media_kind = 'podcast'` from paint one

**Phase 2b — secondary polish (partially landed 2026-05-21)**

Shipped:
- ✅ `studio_templates.media_kind` column + migration + zod + publish-dialog annotation (#913)
- ✅ `<WaveformThumbnail/>` + `VideoProjectThumbnail` audio-only fallback driven by `mediaKindHasVideo()` (#914)
- ✅ Shared `lib/audio/peaks.ts` (`syntheticPeaks`) — deterministic project-id-keyed waveform generator
- ✅ Scene labels project onto `timeline.markers[]` in `canvasStateToTimeline` — every podcast seed's "01 · Cold open" / "02 · Welcome" scene label is a chapter cue automatically

Still deferred (tracked as #907):
- Chapter editor UI — waveform-first audio timeline with chapter pins as clickable cues that write/read `timeline.markers[]`
- ID3 chapter frames (MP3) + `chap` boxes (M4A) on export
- MP3 / M4A / Opus transcode — needs the ffmpeg.wasm strategy to land first; until then every audio-only export ships as WAV regardless of the `OutputProfile` selected
- Per-kind metadata sections in `ProjectDetailsSheet` — episode #, season, show notes, artwork
- Real `audioPeaks(AudioBuffer, …)` decoding helper (re-add when the chapter editor lands)

### Phase 3 — Podcast publish (tracked as #908)

- `studio_shows` parent table — N podcast projects join via `show_id`; shows carry podcast-level metadata (categories, language, copyright, explicit flag, loudness target)
- `/api/podcasts/feed/:show_slug` — generates an RSS 2.0 + iTunes-namespace feed from published podcast projects sharing a `show_id`; chapters from `timeline.markers[]` via `psc:chapters`
- Apple Podcasts Connect OAuth flow (`POST /api/podcasts/show/:id/connect/apple`) + Spotify for Creators OAuth (same pattern)
- ✅ `PublishItem` rows in `StudioSaveMenuV2` already self-gate on `publishDestinationsFor(mediaKind)` (Phase 2) — RSS / Apple / Spotify rows already appear for `mediaKind: 'podcast'` projects but disabled until handlers exist
- Per-show analytics roll-up (listens, completion rate)
- Audio normalization to −16 LUFS default (Apple target) with per-show override via `studio_shows.loudness_target` (Spotify wants −14)

### Phase 4 — Voice template (partially landed 2026-05-21)

**Shipped:**
- ✅ `TEMPLATE_CATALOG` gains `voice_audition_reel / voice_ivr_prompt / voice_audiobook_chapter` entries with `mediaKind: 'voice'`
- ✅ `voice_actor` audience added; existing voice templates audience-tagged
- ✅ `template-seeds.ts` gains voice seeds — section-shaped scenes (slate / read-1 / read-2 / outro etc.) that project onto `timeline.markers[]` so a future chapter editor finds the section breaks pre-populated
- ✅ Render path: voice projects route through the existing `audio-only` strategy (zero v-track clips → emits WAV) — no new engine needed, reuses the Phase-2 pipeline
- ✅ Save menu: `publishDestinationsFor("voice")` already returns `voice-marketplace / profile-audio-embed / profile` from the registry — the row renders, disabled until a handler ships

**Still deferred (tracked as #923):**
- Voice-specific intake — script-input field (with character-count + WPM estimate) + voice-clone picker reading the existing voice marketplace library; replaces the generic `BasicIntake` reuse with a kind-shaped form
- Voice-clone listing wiring — `publishHandlers["voice-marketplace"]` callback that creates a marketplace listing from the finished render
- Profile audio embed — `publishHandlers["profile-audio-embed"]` callback that attaches the WAV to the user's profile as an embeddable audio block

**Also closed in the same pass (#921):** `TemplateThumb` switch gained 11 new cases — 5 film + 3 podcast + 3 voice — so every card in the chooser and on the marketing landing pages paints with a recognisable thumbnail instead of a blank box.

### Phase 5 — Animation template

- `TEMPLATE_CATALOG` gains `animation_*` entries (logo loop / loading spinner / reaction GIF / explainer loop) with `mediaKind: 'animation'`
- Codec catalog gains GIF/WebP/APNG output paths via `gif.js` or ffmpeg.wasm
- Onion-skin overlay on the canvas (read previous + next frame, render at 30% opacity)
- Transparent-BG flag on the canvas → strategy emits alpha channel in HEVC/VP9 path

---

## 4. Implementation notes

### 4.1 Migration safety

`migration 0099` defaults every existing row to `media_kind = 'video'`. No backfill required because video is the only kind that currently exists. The CHECK constraint accepts the full union (`video | podcast | voice | animation`) so Phase 2+ can write the new values without another migration.

Adding a fifth kind = ALTER the CHECK constraint in the same changeset that lands the new `TEMPLATE_CATALOG` entry. The constraint update + the catalog entry are atomic: either the new kind is fully wired across DB + frontend or it doesn't ship.

### 4.2 DRY enforcement

Per the standing rule (`feedback_extract_on_duplication`):

- `outputProfilesFor(kind)` is the SSoT for "which export buttons render?". The save menu, the per-template landing-page "Exports as…" panel (#901), and the API export endpoint all call it.
- `publishDestinationsFor(kind)` is the SSoT for "which publish rows render?". The save menu's Publish section, the publish callbacks dispatcher, and the marketing landing page's destination chips all call it.
- `TEMPLATE_CATALOG.filter(t => t.audiences.includes(id))` is the SSoT for "which templates are 'for athletes'?". #900 landing page + the chooser's audience filter both derive from it. No parallel `AUDIENCE_TO_TEMPLATES` map.
- `MEDIA_KIND_UI[kind]` is the SSoT for the per-kind verb / badge / short label. Editor header chip, save button label, project-card kind badge all read from one record.

### 4.3 Pro gating

Every Pro feature self-gates via the existing `useSubscription().isPro` predicate (`project_nle_decision.md` Pro Feature Mapping). The `OutputProfile.proOnly` flag IS that gate — consumers read it and self-hide the row when `!isPro`. Render facade asserts the same predicate before allowing a Pro-only profile to enter the pipeline.

### 4.4 Subscription / token accounting

Phase 2+ podcast audio-only renders are CPU-bound (ffmpeg.wasm transcode) and don't consume LLM tokens. Existing token-budget accounting (`project_token_pricing.md`) doesn't need to extend. If a future phase adds AI script-to-audio for voice templates, that path goes through the existing LLM budget — same predicate, same meter.

### 4.5 Out of scope for this PRD

The following are referenced but not part of #894 / this PRD:
- **#900 / #901** — public marketing landing pages. Read this PRD's output profiles + audiences but ship in their own pass.
- **#902 / #903** — audience-specific sizzle reel improvements + net-new template seeds. Independent of the foundation.
- **NLE M3 ProRes / DNxHR render** — exists on the M1-M5 roadmap; the M5 audio FX catalog overlaps with podcast Phase 2 and should land in the same milestone.

---

## 5. Open questions

These are deferred decisions captured for Phase 2+ planning:

1. **Episode metadata storage shape.** Storyboard JSONB with underscore-prefixed keys (current pattern for SEO meta) vs a dedicated `podcast_episodes` table. Storyboard JSONB is faster to land; a table buys per-episode RSS feed performance + queryability for "all episodes by show". Leaning table once a second podcast project exists.
2. **Show grouping.** Podcasts need a "show" parent (multiple episodes share one show artwork + RSS feed). Likely a new `studio_shows` table joining N `studio_projects` rows via `show_id`. Out of scope for #894; ship with Phase 3 alongside the RSS generator.
3. **Audio normalization target.** Industry podcast standard is −16 LUFS (Apple) / −14 LUFS (Spotify). The audio-only render strategy should normalize on export. Phase 2 decides which target is the default + whether the user can override.
4. **Video podcast vs. video.** A "video podcast" project (`mediaKind: 'podcast'`, encoded as MP4 with v-tracks populated) overlaps significantly with `mediaKind: 'video'`. The MediaKind axis is differentiated by *publish destinations* (RSS feed, Apple, Spotify) rather than file format. Verified design — no further branching needed.
5. **Animation transparent-MP4 codec choice.** HEVC alpha works on Safari; VP9 alpha works on Chrome/Firefox. Phase 5 ships both and lets the OutputProfile id select; the picker hint flags the compatibility trade-off.

---

## 6. `/studio` landing page changes (UI follow-on to the foundation)

Phase 1 added the data axes but did not touch the chooser UI. The landing page at [/studio](../../hired.video/frontend/pages/studio/StudioLanding.tsx) still presents every template as a video. The follow-on UI pass is tracked as **Gap Register #906** and consists of the changes below — every one self-gates off `template.mediaKind` per the DRY rule (no prop-drilled `canShowPodcastFilter`-style booleans).

### 6.1 Filter pill row — second axis

Today the pill row carries a single filter axis: `TemplateFilter = "all" | TemplateCategory | "created" | "purchased"`. Adding a flat `"podcast" | "voice" | "animation"` set to the same row would mix two semantic axes (intent vs. output). Split into **two** pill rows:

```
Type:     [ All ] [ Video ] [ Podcast ] [ Voice ] [ Animation ]
Use for:  [ All ] [ Promote ] [ Showcase ] [ Hiring ] [ Film ] [ Quick ] [ Created ] [ Purchased ]
```

- **Type row** reads `MEDIA_KINDS` from `@shared/media-kinds`. Labels come from `MEDIA_KIND_UI[kind].badgeLabel` so a kind-rename ripples once.
- **Use-for row** is the existing `TemplateCategory` set unchanged.
- Filter state: `{ mediaKind: MediaKind | "all"; category: TemplateFilter }`. The two axes AND together — picking `Podcast` + `Promote` shows podcast templates in the Promote bucket only.
- Empty-state copy reads `MEDIA_KIND_UI[kind].badgeLabel`: *"No Podcast templates match your search yet — pick a Video template to start while we ship more."*

### 6.2 Template cards — kind badge

Both `BuiltinTemplateCard` and `OwnedTemplateCard` already render a category icon + label. Add a small kind chip in the top-left of the thumbnail (symmetric with the provenance pill on owned cards):

```
┌──────────────────────────────────┐
│ [Podcast]              [Preview] │  ← kind badge top-left, preview top-right
│                                  │
│         (thumbnail)              │
│                                  │
└──────────────────────────────────┘
   ▶ Sizzle Reel
   Drop clips + a music bed…
```

Chip self-gates: returns `null` when `template.mediaKind === "video"` (so the existing surface doesn't gain a redundant "Video" badge on every card). The hide rule lives inside the chip component — consumers do not pass `showBadge`. Single component drives both the carousel card and the per-template landing page (#901) chip.

### 6.3 `NewVideoSplitButton` — kind-aware verb

Today the main label is `"New {lastUsedTemplate.label}"` ([NewVideoSplitButton.tsx:47](hired.video/frontend/components/studio/shared/NewVideoSplitButton.tsx#L47)) and the chevron menu lists every template flat. After podcast/voice/animation templates land, that flat list grows past the 60vh cap (#456 was already in tension). Two changes:

- **Verb** — when the last-used template's mediaKind ≠ `video`, the verb swaps via `MEDIA_KIND_UI[kind].exportVerb`-symmetric reads. Example: `New Sizzle Reel`, `New Podcast Episode`, `New Voice Clip`, `New Logo Loop`. The verb table is the single source — same record drives the export menu, the new-button verb, and the project-card kind badge.
- **Dropdown grouping** — group items by mediaKind with section headers. Each section header reads `MEDIA_KIND_UI[kind].badgeLabel`. Sections render only when the catalog has at least one template of that kind — section visibility self-gates inside the dropdown component (no caller-passed `hasPodcastTemplates` boolean).

### 6.4 `StudioVideoCard` ("My videos" grid) — kind badge

The "My videos" section already renders project-level chrome (visibility chip, hover edit/details/delete pills, inline rename). Add a kind badge to the top-left of the thumbnail symmetric with the template-card change above:

- Read from `project.mediaKind` (already on the DTO post-Phase 1).
- Self-gates: returns `null` when `mediaKind === "video"`.
- Reuses the same chip component as the template card — ONE component, two consumers (`feedback_extract_on_duplication`).

Workspace switcher + section header stay unchanged; the visual change is the badge only.

### 6.5 Deep-link query params

The chooser already accepts `?contentTemplate=<id>`, `?studioTemplate=<slug>`, `?subject=`, `?capture=`, `?new`. No new query param is needed — `template.mediaKind` is derivable from the template id, so a podcast template's `/studio?contentTemplate=podcast_trailer` deep-link works without parameter changes. Forwarder logic in `StudioLanding.tsx` is mediaKind-agnostic by construction.

### 6.6 Audience pills (#900 dependency)

The pill row in §6.1 deliberately does NOT add an audience axis — that lives on the public `/for/:audience` landing pages (#900) rather than inside the auth-gated `/studio` chooser, where users self-select intent + kind. If audience filtering ever moves into `/studio`, the pill row gains a third axis with the same DRY pattern (one source of truth: the catalog's `audiences[]` field).

### 6.7 What stays unchanged

To keep the scope tight:
- `WizardLauncher` — opens the 3-step "create your first video" modal. The wizard already loads `TEMPLATE_CATALOG` and will inherit the new kinds without code changes.
- `WorkspaceSwitcher` — workspace selection is orthogonal to mediaKind.
- `ProjectDetailsSheet` — already kind-agnostic; per-kind metadata sections (episode # for podcast, etc.) land alongside the kind in Phase 2+.
- `VideoProjectThumbnail` — already handles the `kind: 'nle' | 'scene'` discrimination via timeline preview; a podcast project with no v-tracks needs an audio-waveform fallback, which is a Phase 2 task tracked in #905's body.

---

## 7. Reference files

Foundation (Phase 1) landed in:
- [shared/media-kinds.ts](../../hired.video/shared/media-kinds.ts) — enum + output profiles + publish destinations + UI hints
- [frontend/components/studio/templates/audiences.ts](../../hired.video/frontend/components/studio/templates/audiences.ts) — audience taxonomy
- [frontend/components/studio/templates/catalog.tsx](../../hired.video/frontend/components/studio/templates/catalog.tsx) — `mediaKind` + `audiences[]` on every template
- [api/src/db/schema/resumes.ts](../../hired.video/api/src/db/schema/resumes.ts) — `studio_projects.mediaKind` column
- [api/drizzle/0099_studio_projects_media_kind.sql](../../hired.video/api/drizzle/0099_studio_projects_media_kind.sql) — migration
- [api/src/routes/studio.ts](../../hired.video/api/src/routes/studio.ts) — DTO + saveDraft accept mediaKind
- [frontend/lib/services/studio-service.ts](../../hired.video/frontend/lib/services/studio-service.ts) — StudioProject schema + saveDraft client

Podcast MVP (Phase 2) landed in:
- [frontend/components/studio/templates/catalog.tsx](../../hired.video/frontend/components/studio/templates/catalog.tsx) — `podcast_trailer / podcast_episode / podcast_interview` entries
- [frontend/lib/studio/editor-v2/template-seeds.ts](../../hired.video/frontend/lib/studio/editor-v2/template-seeds.ts) — chapter-shaped scene seeds for each podcast template
- [shared/timeline.ts](../../hired.video/shared/timeline.ts) — `isAudioOnly()` predicate + `pickRenderEngine()` routes to `audio-only` strategy
- [frontend/lib/timeline/audio-only-render.ts](../../hired.video/frontend/lib/timeline/audio-only-render.ts) — new strategy: stereo 48 kHz WAV via `renderTimelineAudio` + `audioBufferToWav`
- [frontend/lib/timeline/render.ts](../../hired.video/frontend/lib/timeline/render.ts) — `loadStrategy()` registers the audio-only path
- [frontend/components/studio/v2/StudioSaveMenuV2.tsx](../../hired.video/frontend/components/studio/v2/StudioSaveMenuV2.tsx) — DRY-ified to read `MEDIA_KIND_UI[kind].exportVerb` + `publishDestinationsFor(kind)`
- [frontend/lib/studio/use-create-studio-draft.ts](../../hired.video/frontend/lib/studio/use-create-studio-draft.ts) — first-save persists `template.mediaKind`

Phase 2b (#913 + #914) landed in:
- [api/drizzle/0100_studio_templates_media_kind.sql](../../hired.video/api/drizzle/0100_studio_templates_media_kind.sql) + [api/src/db/schema/studiotemplates.ts](../../hired.video/api/src/db/schema/studiotemplates.ts) — `media_kind` column mirrors `studio_projects`
- [api/src/services/studio/StudioTemplatesService.ts](../../hired.video/api/src/services/studio/StudioTemplatesService.ts) — publish snapshots `mediaKind` from the source project
- [frontend/lib/services/studio-templates-service.ts](../../hired.video/frontend/lib/services/studio-templates-service.ts) — `mediaKind` on `StudioTemplateSchema`
- [frontend/components/studio/PublishAsTemplateDialog.tsx](../../hired.video/frontend/components/studio/PublishAsTemplateDialog.tsx) — read-only kind annotation
- [frontend/lib/audio/peaks.ts](../../hired.video/frontend/lib/audio/peaks.ts) — `syntheticPeaks(seed, bucketCount)` deterministic generator
- [frontend/components/studio/shared/WaveformThumbnail.tsx](../../hired.video/frontend/components/studio/shared/WaveformThumbnail.tsx) — kind-palette SVG waveform
- [frontend/components/studio/shared/VideoProjectThumbnail.tsx](../../hired.video/frontend/components/studio/shared/VideoProjectThumbnail.tsx) — routes to waveform via `mediaKindHasVideo()`
- [frontend/lib/studio/editor-v2/timeline-emit.ts](../../hired.video/frontend/lib/studio/editor-v2/timeline-emit.ts) — scene labels project onto `timeline.markers[]` (comment updated to call out podcast-chapter projection)

Phase 4 (voice templates) + #921 landed in:
- [frontend/components/studio/templates/audiences.ts](../../hired.video/frontend/components/studio/templates/audiences.ts) — `voice_actor` audience added
- [frontend/components/studio/templates/catalog.tsx](../../hired.video/frontend/components/studio/templates/catalog.tsx) — `voice_audition_reel / voice_ivr_prompt / voice_audiobook_chapter` entries
- [frontend/lib/studio/editor-v2/template-seeds.ts](../../hired.video/frontend/lib/studio/editor-v2/template-seeds.ts) — voice seeds (section-shaped scenes that project onto chapter markers)
- [frontend/components/studio/templates/TemplateThumb.tsx](../../hired.video/frontend/components/studio/templates/TemplateThumb.tsx) — 11 new `case` branches (5 film + 3 podcast + 3 voice) so every card has a recognisable thumbnail; shared `<ThumbWaveformBars/>` helper

Adjacent (read-only context):
- [shared/timeline.ts](../../hired.video/shared/timeline.ts) — kind-agnostic Timeline JSON spec
- [shared/studio-purposes.ts](../../hired.video/shared/studio-purposes.ts) — LLM purpose enum (the third axis)
- `memory:project_nle_decision.md` — M1-M5 NLE roadmap that this PRD slots into
- `memory:project_voice_marketplace.md` — the voice marketplace this PRD's `voice` kind builds on
- `memory:project_template_marketplace.md` — the `/search?category=templates` surface this catalog feeds
