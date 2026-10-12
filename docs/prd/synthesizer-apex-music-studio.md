# PRD — APEX Synthesizer → Studio Music Instrument

**Owner:** hired.video Studio
**Status:** Spec + gap analysis. The standalone **APEX** synth (`c:\code\hired\synth`) has *already been substantially ported* into the Studio under gap **#457 (✅ Done, mixer half completed 2026-06-06)**. Authoritative per-item status lives in the [Consolidated Gap Register](../../README.md) (#457, #460, and the new entries logged at the bottom of this doc).
**Date:** 2026-06-14
**Related:** [Studio Media Kinds](studio-media-kinds.md) · [Voice Cloning + LLM Narration](voice-cloning-and-llm-narration.md) · project memory `project_nle_decision.md` (render = client-side ffmpeg.wasm, $0 infra) · `project_studio_media_kinds.md` (mediaKind axis) · `project_template_marketplace.md` (how shareable assets are listed) · `project_voice_marketplace.md` (the asset-monetization pattern synth presets should follow).

---

## 1. Problem / Context

`c:\code\hired\synth` is a self-contained, single-product web app — codename **APEX** — that does one thing: it is a browser-native **subtractive synthesizer + 88-key piano workstation**. It is a Vite + React 18 SPA (the "Fusion Starter" template) with an Express stub server that holds no synth logic; **100% of the instrument runs client-side in the browser via Web Audio + Tone.js**. That posture is exactly hired.video's Studio posture (`project_nle_decision.md`: client-side synthesis, $0 marginal infra), which is why the port was tractable.

The question this PRD answers: **what is APEX's full feature set, what of it already lives in hired.video, and what is the genuine remaining gap?**

The short answer up front, so the rest of the doc is read correctly: **the instrument is ported and shipped.** APEX's mixer (oscillators / filters / effects / master / ADSR), its 88-key playable keyboard, live play + record + offline WAV bounce, and JSON preset save/load all exist today under **Studio → Actions → Original Music → "Synth"** tab. The remaining gaps are (a) a handful of features APEX *implements* that the port skipped, (b) features APEX only *mocks in its UI* (which neither product truly has), (c) features APEX only *markets* (aspirational copy, built in neither), and (d) **productization gaps unique to hired.video** — chiefly that a synth patch is not yet a first-class, persisted, shareable/monetizable asset the way a voice clone or template is.

## 2. APEX feature set (what `c:\code\hired\synth` actually is)

### 2.1 Routes / surface
| Route | File | What it is |
|---|---|---|
| `/` | `client/pages/Index.tsx` | Marketing landing page for "APEX — The Modern Synthesizer". Hero + feature grid + "synthesis engines" + modulation section + CTA. **Marketing copy, not wired to code.** |
| `/synth` | `client/pages/Synthesizer.tsx` | The actual instrument: oscillator / filter / effect / modulation / master panels + the `<Piano>` keyboard. |
| `/presets` | `client/pages/Presets.tsx` | Preset *browser* — search + category filter + grid of preset cards with download counts + "Load Preset". **Hardcoded mock data**, no backend. |
| `/docs` | `client/pages/Docs.tsx` | In-app documentation (Getting Started / Oscillators / Filters / Modulation / Effects / Performance). Describes more than the code implements. |

### 2.2 The instrument (`Synthesizer.tsx` + `Piano.tsx`) — what is genuinely implemented
- **Oscillator stack** (`Oscillator[]`, add/remove, min 1): per-osc **waveform** (`sine | triangle | square | sawtooth | pulse`), **volume** (0–100), **pan** (−50..50). Fields `pitch` + `fineTune` exist in the type but have **no UI control** in APEX. Editable per-osc name.
- **Filter rack** (`Filter[]`, add/remove, enable toggle): **type** (`lowpass | highpass | bandpass`), **cutoff** (20–20000 Hz), **resonance** (→ biquad Q = resonance/10), **drive** (−12..12 dB, applied as a gain stage). Built with native Web Audio `BiquadFilterNode`.
- **Effect rack** (`Effect[]`, add/remove, enable): **type** (`reverb | delay | chorus`), **mix** (0–100). Built with **Tone.js** (`Tone.Reverb`, `Tone.Delay`, `Tone.Chorus`), serially chained, wet = mix/100.
- **Master:** volume knob + (cosmetic) tuning knob.
- **88-key Piano** (`Piano.tsx`): full A0–C8 frequency table, white/black key rendering, click-to-play (fixed 0.5 s note), the full osc/filter/effect chain applied per note via Web Audio + Tone.js.
- **Record + Playback:** capture `{note, startTime, duration, frequency}` on click while armed; play back via scheduled `setTimeout`s; stop.
- **Sheet music:** recorded notes → **ABC notation** → rendered with **`abcjs`** into a `#sheet-music` div.
- **Preset save/load** (`synthSerializer.ts`): serialize the whole instrument state (`masterVolume`, oscillators, filters, effects, recordedNotes, id counters) to a versioned JSON, download as a file, and re-import via file picker.

### 2.3 UI-stub features (present in APEX's UI, but wired to no-ops)
These render as controls but their `onChange` is `() => {}` or their value is a literal — APEX **does not implement them**:
- **Unison** panel: Voices / Detune / Spread sliders.
- **Modulation** panel: draggable `ENV 1 / ENV 2 / LFO 1 / LFO 2` source chips ("drag to parameters") — **no drop targets, no modulation engine.**
- **Polyphony** slider, **CPU Usage** bar (hardcoded 32%), **Status** stats (Voices 7/16, CPU 32%, Latency 2.1 ms) — all literal display values.
- Master **Tuning** knob (no-op).
- Per-osc **pitch / fine-tune** (in the data model, no control).

### 2.4 Marketing-only features (claimed on `/` and `/docs`, built nowhere in APEX)
Multi-engine synthesis (**wavetable / virtual-analog / granular / sample playback / noise**), spectral/wavetable editing, dual-filter serial-parallel morphing, **MPE / MIDI-learn / aftertouch / pitch-wheel**, **arpeggiator / step sequencer / glide**, **A/B preset comparison**, "thousands of presets by genre/mood." None of this exists in APEX's code — it is competitive-positioning copy (the landing page explicitly name-checks Serum / Pigments / Vital).

## 3. Current state in hired.video (the port — gap #457 ✅)

APEX was ported into the Studio, not as a standalone app but as a **music-production tool that feeds the NLE music lane**. The instrument hands the parent a `(blob, durationSec)` WAV via `onMusicReady`, identical to the other music surfaces — so `StudioActions` / `ActionsPanel` are agnostic to which surface produced the track.

| APEX concept | hired.video implementation | Notes |
|---|---|---|
| Instrument UI | `frontend/components/studio/music/SynthComposer.tsx` | The "Synth" tab; multi-osc stack + filter rack + effect rack + master + ADSR + keyboard + record + bounce + preset save/load. |
| Oscillator/Filter/Effect racks | `components/studio/music/synth/{OscillatorRack,FilterRack,EffectRack,MasterControls}.tsx` | Per-osc waveform/octave(semis)/fine-cents/level/pan; filters low/high/band × cutoff/Q/drive; effects reverb/delay/chorus. |
| Patch data model | `frontend/lib/audio/synth-patch.ts` (`SynthPatch`, `OscillatorSpec`, `FilterSpec`, `EffectSpec`, `MasterSpec`) | Pure data, round-trips to JSON; richer than APEX's (real `detuneSemis`/`detuneCents`, dB→gain helper). |
| Audio realization | `frontend/lib/audio/synth-graph.ts` (`LiveSynth` + `renderPatchToWavBlob`) | **One** Tone.js realization shared by live preview and offline `Tone.Offline` bounce, so the WAV matches what was played. Continuous-param ramping; structural rebuild only on add/remove/retype. |
| Shared primitives | `frontend/lib/audio/synth-engine.ts` (NOTE_FREQUENCIES A0–C8, ADSR, Waveform, `schedulePitchedNote`, `renderPlayedNotesToBuffer`) | Shared across Synth + Piano + step sequencer so timbres are identical. |
| 88-key keyboard | `components/studio/music/Keyboard.tsx` (`Keyboard`/`OctaveShifter`/`buildKeys`/`useComputerKeyboard`) | 3-octave window paged through full 88 via octave-shift; mouse + pointer + QWERTY map. De-duplicated; consumed by both Synth + Piano. |
| Preset save/load | `frontend/lib/audio/synth-preset.ts` | Versioned, **defensive** parser (never throws on partial/old/garbage; coerces to a playable patch). **Client-side file download/upload only.** |
| Piano workstation | `components/studio/music/PianoComposer.tsx` | Quick single-timbre keyboard, real note durations (not APEX's fixed 0.5 s), record → WAV. |
| Step sequencer | `components/studio/OriginalMusicComposer.tsx` | 5 lanes (kick/snare/hat/bass/melody) × 16 steps, C-major scale degrees — a feature APEX only *marketed*, real here. |
| Entry point | `components/studio/music/MusicComposer.tsx` (Tabs: Step sequencer / Piano / Synth) → `StudioActions.tsx` + `v2/ActionsPanel.tsx` | |
| Tests | `frontend/lib/audio/__tests__/synth-patch.test.ts` | Patch model + preset round-trip + defensive parsing. |
| Shared live-context safety | `frontend/lib/audio/live-audio-context.ts` (#1953) | Ref-counted shared `AudioContext`; the synth/piano release on unmount. |

**Net:** APEX's *real* instrument is fully present and is arguably better-architected here (shared single realization for preview + bounce, defensive preset parsing, de-duplicated keyboard). What was **not** ported is everything in §2.3 (UI-stubs APEX never implemented) and §2.4 (marketing copy), plus a few real APEX features called out next.

## 4. Gap analysis (APEX feature → hired.video status)

Legend: ✅ shipped · ➖ neither product truly implements (APEX only mocks/markets it) · ❌ APEX implements it, port skipped it · 🟡 productization gap unique to hired.video.

| # | Feature | APEX | hired.video | Verdict |
|---|---|---|---|---|
| 1 | Oscillator stack (waveform/level/pan/add-remove) | ✅ real | ✅ `OscillatorRack` (+ real detune semis/cents) | ✅ at parity / better |
| 2 | `pulse` waveform | ✅ (5th waveform) | ❌ uses the shared 4-waveform set (sine/tri/sqr/saw) | **❌ minor gap — already noted in #457 deferred list** |
| 3 | Per-osc pitch / fine-tune | data-only (no UI) | ✅ real `detuneSemis` + `detuneCents` controls | ✅ better than APEX |
| 4 | Filter rack (type/cutoff/Q/drive/enable) | ✅ real | ✅ `FilterRack` | ✅ parity |
| 5 | Effect rack (reverb/delay/chorus/mix/enable) | ✅ real (Tone.js) | ✅ `EffectRack` (Tone.js) | ✅ parity |
| 6 | Master volume + tuning | ✅ (tuning cosmetic) | ✅ real master gain + global detune-cents | ✅ better |
| 7 | Shared ADSR envelope | implicit gain ramp | ✅ explicit `AdsrControls` + `DEFAULT_ADSR` | ✅ better |
| 8 | 88-key piano, click-to-play | ✅ | ✅ `Keyboard` (+ computer-key + pointer + octave paging) | ✅ better |
| 9 | Record played notes | ✅ (fixed 0.5 s) | ✅ real note-on/off durations | ✅ better |
| 10 | Playback of recording | ✅ (setTimeout) | ✅ offline bounce → WAV (deterministic) | ✅ better |
| 11 | **Sheet-music render (abcjs)** | ✅ real | ❌ **deferred, `abcjs` dep not added** | **❌ gap — #457 deferred** |
| 12 | JSON preset save/load (file) | ✅ | ✅ `synth-preset.ts` (versioned + defensive) | ✅ better |
| 13 | **Persisted preset library + browse/search** (`/presets`) | mock UI only | ❌ no persistent store, no browse | **🟡 productization gap — NEW #2069** |
| 14 | **Preset marketplace (publish/price/buy/favorite)** | mock UI | ❌ — voice clones + templates have this, synth patches don't | **🟡 productization gap — NEW #2069** |
| 15 | Unison (voices/detune/spread macro) | UI-stub (no-op) | ❌ per-osc detune exists, no one-knob unison | ➖ neither — #457 deferred |
| 16 | ENV/LFO **modulation routing** (matrix) | UI-stub (drag chips, no engine) | ❌ ADSR only, no mod matrix | ➖ neither — #457 deferred |
| 17 | Per-oscillator ADSR / filter envelope | ✗ | ❌ single shared ADSR | ➖ neither — #457 deferred |
| 18 | Polyphony / CPU / latency stats | cosmetic literals | ❌ (not meaningful client-side) | ➖ drop — vanity metrics |
| 19 | MIDI input (Web MIDI / MPE / MIDI-learn) | marketed only | ❌ deferred | ➖ neither — #457/#457-deferred |
| 20 | Arpeggiator / glide / legato | marketed only | ❌ (step sequencer exists separately) | ➖ neither |
| 21 | Multi-engine (wavetable/granular/sample/VA/noise) | marketed only | ❌ subtractive only | ➖ neither — large net-new, out of scope |
| 22 | Scale switching beyond C-major (sequencer) | n/a | ❌ C-major only | ➖ #457 deferred (sequencer side) |
| 23 | Pedal sustain (piano) | ✗ | ❌ | ➖ #457 deferred |
| 24 | Mobile multi-touch / sustained-chord recording | unverified | 🟡 untested on touch devices | **🟡 verification gap — #460 open** |
| 25 | Marketing landing + docs pages | ✅ (APEX site) | ➖ N/A — hired.video has its own marketing + help system | ➖ do not port |
| 26 | **Discoverability** (synth as a named tool) | top-level `/synth` route | 🟡 buried 3 levels deep (Actions → Original Music → Synth) | **🟡 productization gap — NEW #2070** |
| 27 | **AI "describe a sound → patch"** | ✗ | ❌ — hired.video has an LLM gateway; synth patches are pure JSON | **🟡 net-new opportunity — NEW #2071** |

### 4.1 Reading of the gaps
- **Parity is done.** Every row APEX genuinely implements is ✅ in hired.video, usually *better* (single shared preview/bounce realization, defensive presets, real detune, explicit ADSR, computer-keyboard play) — except two real APEX features the port skipped: **`pulse` waveform (#2)** and **abcjs sheet-music render (#11)**, both already captured in #457's deferred list.
- **The "missing" synth power-features (#15–#21) were never built in APEX either** — they are UI stubs or marketing copy. Calling them "gaps vs APEX" would be inaccurate; they are *new product features* that happen to be foreshadowed by APEX's mock UI. They stay deferred under #457 unless prioritized on their own merits.
- **The real, hired.video-specific gaps are productization (#13/#14/#26/#27):** a synth patch is currently a throwaway file, not a first-class asset. hired.video already has the exact pattern to fix this — `studioVoiceClones` + `studioVoiceCloneLicenses` (voice marketplace, `project_voice_marketplace.md`) and `studioTemplates` + `templateLicenses` (template marketplace, `project_template_marketplace.md`). A synth patch is a smaller, simpler asset than either (pure JSON, no R2 media, no consent surface) and could reuse the same publish→price→license→buy machinery almost verbatim.

## 5. Goals / Non-goals

**Goals**
1. Record the APEX feature set and the port's true state so no one re-ports an already-shipped instrument (this doc).
2. Close the two real skipped APEX features where cheap: **`pulse` waveform** and **abcjs sheet-music render** (both #457-deferred).
3. Turn a synth patch into a **first-class persisted, shareable, optionally monetizable asset**, reusing the existing voice-clone / template marketplace machinery rather than inventing a new one (#2068).
4. Make the instrument **discoverable** as a named creative tool, role-gated through the existing access manager (#2069).
5. Keep the **$0-marginal-infra** posture: synthesis and rendering stay client-side; only patch *metadata* (JSON) and licensing rows touch the server.

**Non-goals**
- Multi-engine synthesis (wavetable / granular / sample / VA / noise) — large net-new, APEX never built it; out of scope here.
- A real modulation matrix / per-osc envelopes / arpeggiator — track on their own merits, not as "APEX parity."
- Porting APEX's marketing landing or docs pages — hired.video owns its marketing surface and uses the context-aware HelpDrawer (`project_context_aware_help.md`) for help.
- A new `music` mediaKind — the synth correctly feeds the NLE music lane as a WAV; it does not need its own project kind.

## 6. Proposed approach (phased, if prioritized)

**Phase 1 — close the two real APEX-feature gaps (small).**
- Add `pulse` to the shared `Waveform` set and the oscillator picker (Web Audio has no native `pulse`; realize as a `PeriodicWave` or a duty-cycle pulse, consistent across `LiveSynth` + offline render). Update `synth-preset.ts` coercion allow-list.
- Add `abcjs` dep + a sheet-music render of the recorded `{freq,startSec,durationSec}` notes (the data already exists in `SynthComposer`/`PianoComposer`). Render-only; no notation editing.

**Phase 2 — patch as a first-class asset (the real productization win, #2068).**
- New `studio_synth_patches` table mirroring `studioVoiceClones`'s shape: `id, userId, companyId, name, description, patch JSONB, visibility (private|unlisted|public), priceCents, platformFeeBps, consentAgreedAt?, viewCount, purchaseCount`. Reuse `templateLicenses`' polymorphic ledger (add `templateKind: 'synth_patch'`) rather than a bespoke license table — DRY with `project_template_marketplace.md`.
- Routes mirror the voice-clone family: `GET /api/studio/synth-patches/library`, `GET /marketplace`, `POST /`, `PATCH /:id`, `POST /:id/claim`, cart-checkout. Read paths go through `getOrSetCached` with write-invalidation (per the caching rule); marketplace listing keyed by a version token (unbounded keyspace).
- Frontend: a "My patches" / "Browse patches" surface (this is what APEX's mock `/presets` page *pretended* to be) reusing the marketplace card + cart already built for voice clones. `SynthComposer`'s save/load gains "Save to library" / "Load from library" alongside the existing file save/load (keep file export — it is the portable escape hatch).

**Phase 3 — discoverability + access (#2069).**
- Register the synth/music studio as a named tool in the role-feature access manager (`project_role_feature_access_manager.md`) so SuperAdmin can show/hide it per role, and give it a discoverable entry rather than 3-levels-deep-only.

**Phase 4 (optional) — AI patch generation (#2070).**
- "Describe a sound" → LLM (Builderforce gateway, `project_llm_gateway_models.md`) returns a `SynthPatch` JSON validated by the existing defensive `coercePatch`. Bills the token ledger (`project_token_pricing.md`); no new SKU. Naturally pairs with the patch library (generate → tweak → save/publish).

## 7. Gaps logged to the Consolidated Gap Register

Pre-existing (already tracked): **#457** (APEX port ✅ Done — carries the `pulse`/abcjs/ENV-LFO/unison/MIDI/scale/pedal deferred list) and **#460** (PianoComposer mobile multi-touch unverified).

New entries logged with this PRD:
- **#2069** — Synth patch persistence + preset library + marketplace (turn file-only presets into a first-class asset; reuse voice-clone / template-marketplace machinery).
- **#2070** — Synth/music studio discoverability + role-feature-access registration (currently reachable only 3 levels deep).
- **#2071** — AI "describe a sound → SynthPatch" generation via the LLM gateway, validated by the existing `coercePatch`.
