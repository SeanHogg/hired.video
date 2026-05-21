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

The studio editor was originally built to produce one output: an MP4 video for a hired.video profile. Every layer below the Timeline JSON spec hardcodes that assumption — the codec catalog, the save menu, the publish destinations, the render facade. The product surface has since grown to want **four distinct authoring contexts** that share most of the editor primitives but diverge sharply on save / export / publish:

| Kind | Primary output | Primary audience | Existing reuse |
|---|---|---|---|
| `video` | MP4 / MOV / WebM | Job seekers, creators, recruiters | The whole current studio |
| `podcast` | MP3 / M4A + RSS feed (optional video podcast branch) | Podcasters, educators, founders | Audio mixer, voiceover track, markers (chapters), multicam (multi-host) |
| `voice` | MP3 / WAV (audio-only) | Voice artists, voice marketplace | Voice clone marketplace, WebGPU TTS engines |
| `animation` | GIF / WebP / APNG / transparent MP4 | Designers, creators, marketers | Canvas, motion presets, transition catalog |

The user's request that surfaced this PRD: *"users are wanting to be able to manage a new template type for podcasts. ultimately the same structure as a user who wants to manage voice and then have voice templates. they want to create podcasts and manage audio and do overlays."*

Translation: introduce a single `mediaKind` axis (not a per-kind editor fork) so the same Studio surface handles every output while the save / export / publish contexts diverge cleanly.

---

## 1. Architecture

### 1.1 The orthogonal axes

Studio projects now carry **three** axes that consumers may filter or branch on. They are deliberately orthogonal — adding a value to one does NOT require touching the others:

| Axis | Field | Values | Meaning |
|---|---|---|---|
| Storage | `studio_projects.kind` | `'scene' \| 'nle'` | Which editor surface authored the row + which JSONB column to read (`storyboard` vs `timeline_spec`). Internal detail. |
| Output | `studio_projects.media_kind` | `'video' \| 'podcast' \| 'voice' \| 'animation'` | What the finished project becomes. Drives the export menu, publish destinations, per-template "Exports as…" panel. |
| Purpose | `_purpose` in storyboard JSONB | `STUDIO_PURPOSES` enum | LLM prompt config for the script generator (resume / job_ad / personal_brand / etc.). |

Existing axes that remain orthogonal too:

- **`TemplateDef.category`** — `'promote' \| 'showcase' \| 'hiring' \| 'film' \| 'quick'` — intent bucket for the /studio filter pills.
- **`TemplateDef.audiences[]`** — `Audience[]` (athletes, actors, musicians, …) — demographic. SSoT for #900 audience landing pages + #901 template-page "best for" chips.

**Per the standing DRY rule:** consumers self-gate by reading these fields directly. Never pass `canPublishToYouTube` or `canExportMp3` booleans through component props — the export menu calls `outputProfilesFor(mediaKind)` and the publish list calls `publishDestinationsFor(mediaKind)`. Shared components decide their own visibility.

### 1.2 Why the Timeline JSON spec doesn't need to fork

[shared/timeline.ts](../../hired.video/shared/timeline.ts) is already media-kind-agnostic and was designed this way for the M1-M5 NLE roadmap (`project_nle_decision.md`). It carries:

- **v1 / v2 / v3** video tracks (background / widget overlays / scene-post effects)
- **a1 / a2** audio tracks (music + voiceover)
- **`markers[]`** — fungible cue points; podcast chapters slot in with zero schema change
- **`multicamGroups`** — multi-host video podcast comes for free
- **`ClipEffect`** registry — `audio-eq / audio-compressor / audio-limiter` from the M2/M5 effect catalog ARE the podcast audio chain

The render facade ([render.ts](../../hired.video/frontend/lib/timeline/render.ts)) already routes between WebCodecs and ffmpeg.wasm via [`pickRenderEngine`](../../hired.video/shared/timeline.ts). The new `mediaKind` axis adds a third branch (audio-only) and an output profile lookup — the facade contract stays the same: `Timeline → output Blob`.

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

### Phase 2 — Podcast MVP

**Goal:** ship the first non-video kind end-to-end. Validates the foundation against the hardest case (audio-first, chapter authoring, RSS publish).

- `TEMPLATE_CATALOG` gains `podcast_*` entries (intro/episode/trailer) with `mediaKind: 'podcast'` + `audiences: ['podcaster', 'educator', 'founder']`
- Audio-only render strategy — new entry in `render.ts` facade that emits MP3/M4A/Opus/WAV without invoking the video encoder when no v-track has clips
- `pickRenderEngine` gains an `audio-only` branch that selects this strategy when `timeline.outputProfile` is one of the audio-only profiles
- Chapter editor — UI writes to `timeline.markers[]`; export attaches ID3 chapter frames (MP3) or `chap` boxes (M4A)
- `StudioSaveMenuV2` reads `outputProfilesFor(project.mediaKind)` instead of the hardcoded "Export MP4" row — per DRY, ONE menu component, gates per-kind
- `template-seeds.ts` gains podcast seeds (intro music + voiceover track + outro music + chapter markers)

### Phase 3 — Podcast publish

- `/api/podcasts/feed/:show` — generates an RSS 2.0 + iTunes-namespace feed from published podcast projects sharing a `showId`
- Apple Podcasts Connect OAuth flow + Spotify for Creators OAuth flow
- `PublishItem` rows in `StudioSaveMenuV2` self-gate on `publishDestinationsFor(mediaKind)` — RSS / Apple / Spotify rows appear only for `mediaKind: 'podcast'` projects

### Phase 4 — Voice template

- `TEMPLATE_CATALOG` gains `voice_*` entries (voicemail / audiobook chapter / audition reel) with `mediaKind: 'voice'`
- Voice editor surface — script-input + voice-picker + simple waveform visualizer; mounts on top of the existing voice-clone marketplace (`project_voice_marketplace.md`) and WebGPU TTS engines
- Render path = `OfflineAudioContext → WAV → ffmpeg.wasm transcode` (no new engine; reuses the audio-mixer pipeline)
- Voice marketplace listing as a publish destination (already exists; just needs the new mediaKind → destination wiring)

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

## 6. Reference files

Foundation landed in:
- [shared/media-kinds.ts](../../hired.video/shared/media-kinds.ts) — enum + output profiles + publish destinations + UI hints
- [frontend/components/studio/templates/audiences.ts](../../hired.video/frontend/components/studio/templates/audiences.ts) — audience taxonomy
- [frontend/components/studio/templates/catalog.tsx](../../hired.video/frontend/components/studio/templates/catalog.tsx) — `mediaKind` + `audiences[]` on every template
- [api/src/db/schema/resumes.ts](../../hired.video/api/src/db/schema/resumes.ts) — `studio_projects.mediaKind` column
- [api/drizzle/0099_studio_projects_media_kind.sql](../../hired.video/api/drizzle/0099_studio_projects_media_kind.sql) — migration
- [api/src/routes/studio.ts](../../hired.video/api/src/routes/studio.ts) — DTO + saveDraft accept mediaKind
- [frontend/lib/services/studio-service.ts](../../hired.video/frontend/lib/services/studio-service.ts) — StudioProject schema + saveDraft client

Adjacent (read-only context):
- [shared/timeline.ts](../../hired.video/shared/timeline.ts) — kind-agnostic Timeline JSON spec
- [shared/studio-purposes.ts](../../hired.video/shared/studio-purposes.ts) — LLM purpose enum (the third axis)
- `memory:project_nle_decision.md` — M1-M5 NLE roadmap that this PRD slots into
- `memory:project_voice_marketplace.md` — the voice marketplace this PRD's `voice` kind builds on
- `memory:project_template_marketplace.md` — the `/search?category=templates` surface this catalog feeds
