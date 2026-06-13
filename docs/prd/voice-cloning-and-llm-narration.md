# PRD — Voice Cloning (VibeVoice) + LLM-Driven Narration

**Owner:** hired.video Studio
**Status:** Spec. Authoritative status of each entry lives in the [Consolidated Gap Register](../../README.md) (#1991, #1994–#2000).
**Date:** 2026-06-13
**Related:** [Studio Media Kinds](studio-media-kinds.md) · project memory `project_voice_marketplace.md` (95/5 split + ToS §9a) · `project_token_pricing.md` (LLM + synthesis bill the token ledger, no per-clip SKU) · `project_nle_decision.md` (render = client-side, $0 infra) · `project_llm_gateway_models.md` (Builderforce gateway dispatch).

---

## 1. Problem

Voice cloning is **marketed as a shipped Pro feature and wired end-to-end — except the one step that actually clones a voice.**

- The marketing surface (Pricing page, Synthesia/HeyGen comparison rows) lists **VibeVoice** alongside Kokoro + Piper as an available cloning engine, and sells "AI voice cloning (your own voice)" + a "Voice Marketplace … creator revenue share".
- The backend is **complete**: `studio_voice_clones` + `studio_voice_clone_licenses` tables, the full `/api/studio/voice-clones/*` route family (upload sample → publish → price → marketplace catalog → claim/checkout → license-checked `library`), 95/5 creator split, R2-stored reference samples. See [studio-features.ts](../../api/src/routes/studio-features.ts) and [studiofeatures.ts](../../api/src/db/schema/studiofeatures.ts).
- The client TTS facade ([tts-engines.ts](../../frontend/lib/services/tts-engines.ts)) already routes the `vibevoice` engine: it fetches the license-checked reference sample, loads a WebGPU model from a CDN ESM bundle, and synthesizes PCM that muxes into exports and dubbing.

**The gap (#1991):** `VIBEVOICE_AVAILABLE = false` and `VIBEVOICE_CDN = ""` in [tts-engines.ts](../../frontend/lib/services/tts-engines.ts) — *"VibeVoice has no published web ESM bundle yet."* So:

- `getEngineUnavailableReason("vibevoice")` returns `"Coming soon"`, the picker disables it, and any caller falls back to Web Speech.
- **Kokoro and Piper work but cannot clone** (`supportsCloning: false`) — they synthesize from a fixed voice library, not a user's reference sample.
- Net result: a Pro user can upload a sample, publish it to the marketplace, and buy someone else's clone — but **no one can actually hear a cloned voice**, because there is no working clone-capable synthesizer. The marketplace sells a key to a locked room.

Separately, the LLM "creation" flows that *should feed text into the cloned voice* — AI script generation, the dubbing panel, the value-proposition/pitch builder — today only reach the non-cloning engines, because the clone engine never resolves.

## 2. Goals / Non-goals

**Goals**
1. Make voice cloning **actually produce audio in the user's (or a licensed creator's) voice** — close #1991 with a real synthesis path, not just flipping a flag.
2. Keep the **$0-marginal-infra** posture where viable: client-side WebGPU synthesis (consistent with `project_nle_decision.md`), with a clearly-scoped server fallback only where the client can't deliver.
3. Wire the **LLM creation flows** (script → narration, dubbing, pitch) to the cloning engine through one shared seam, so "the AI wrote it and it speaks in my voice" works in every studio format.
4. Ship **consent + provenance + safety** as first-class, not an afterthought — cloning a human voice is a legal/ethical liability surface.
5. Degrade honestly: if cloning is unavailable in the current environment, the UI says so and falls back to a named non-cloned voice — never silently swaps without telling the user.

**Non-goals**
- Real-time / streaming voice conversion (live mic → cloned voice). Batch synthesis only.
- Multi-speaker dialogue casting in one render pass (tracked separately if demanded).
- Photoreal avatar lip-sync changes — the AvatarWidget already consumes whatever PCM the engine emits via `onBoundary`; no change needed there.
- Re-architecting the marketplace/licensing — it exists and is correct.

## 3. The synthesis-backend decision (the crux of #1991)

The blocker is purely "what model runs, and where." Three options:

| Option | Where it runs | Marginal cost | Quality | Risk |
|---|---|---|---|---|
| **A. Client-side WebGPU bundle** (current design intent) | Browser, WebGPU | $0 | Good, but gated on a *published, stable* web ESM bundle that does zero-shot cloning. VibeVoice-1.5B has no such bundle today. | Dependency does not exist yet; large first-load (~350MB); no WebGPU = no feature. |
| **B. Server-side inference via the gateway** | A hosted inference endpoint (Builderforce gateway or a dedicated TTS provider) called from the API | Per-second-of-audio cost, billed to the token ledger | Reliable, no client GPU needed, works on mobile | Adds an outbound paid dependency + an audio-bytes return path the gateway doesn't model today (it's text/string-only — see `llm-client.ts` line ~1010). |
| **C. Hybrid** | Client WebGPU when available + a server fallback | $0 on capable clients, paid only on fallback | Best coverage | Two code paths to keep in parity. |

**Recommendation: build the engine behind the existing `vibevoice` seam as a provider-agnostic capability, ship Option B (server) first for guaranteed coverage, then add Option A (client WebGPU) when a production-grade clone bundle lands — i.e. converge on C.**

Rationale:
- The client seam already exists and fails soft, but it is blocked on an external artifact we don't control. We should not let a marketing claim ride indefinitely on "when a CDN bundle appears."
- A server path makes the claim true on every device (incl. mobile/Safari with no WebGPU), at a metered cost that the token ledger already accounts for.
- Decoupling: rename the engine concept from the brand "VibeVoice" to a capability — **`clone` engine** with a pluggable backend (`provider: "vibevoice-web" | "tts-server" | …`). `studio_voice_clones.provider` already stores a provider string; we honor it instead of hardcoding. This is the DRY fix — one capability seam, swappable backend — and it means the next better clone model is a config change, not a call-site rewrite.

### 3.1 Server synthesis contract (Option B)

New route `POST /api/studio/voice-clones/:id/synthesize`:

```
req:  { text: string, speed?: number, language?: string }   // :id = studio_voice_clones.id
auth: must be owner OR hold a license row (reuse the existing library/access check)
flow: load reference sample (R2) → call TTS provider with (referenceAudio, text) →
      receive audio bytes → return { audioUrl, audioKey, durationMs, wordTimestamps }
bill: charge the token ledger by characters/seconds synthesized (featureKey `voice_clone_synthesis`),
      same metered model as LLM calls — no new SKU (project_token_pricing.md)
cache: read-through on sha256(cloneId + normalizedText + speed + lang) →
      getOrSetCached + persist to studio_voiceovers; identical re-synthesis is free + instant
```

- **Audio return path:** the gateway client is string-only today. Synthesis goes through a *separate* adapter ([services/adapters/tts-provider.ts], new) that returns bytes, not through `llm-client.ts`. Logged as a constraint, not a workaround.
- **Reuse:** the output shape (`audioUrl`, `wordTimestamps`, `durationMs`) is exactly `studio_voiceovers` — persist there so captions, the AvatarWidget, and the timeline consume cloned audio with zero new plumbing.

### 3.2 Client path (Option A, when unblocked)

When a production clone bundle is published: set `VIBEVOICE_CDN` + flip the flag (or register a new provider). The facade already handles load/synthesize/fallback. The picker auto-enables via `getEngineUnavailableReason`. No call-site changes — this is why the seam exists.

## 4. LLM-driven creation flows that consume the service

"LLM creation to use this service" = the AI produces the words, the clone speaks them. All of these already generate text; the work is routing that text through the clone seam (server or client) instead of only the non-cloning engines.

1. **AI script → cloned narration (video / podcast / pitch).** The script scaffolders ([page-video-scaffolder.ts](../../api/src/services/studio/page-video-scaffolder.ts), comic/skills generators) emit scene captions today rendered with Kokoro/Piper. Add "Narrate in my voice" → each VoiceoverClip's `voiceId` becomes a `studio_voice_clones.id` and synthesis routes to the clone engine. One toggle, shared resolver.
2. **Dubbing in your own cloned voice.** [StudioDubbingPanel.tsx](../../frontend/components/studio/dubbing/StudioDubbingPanel.tsx) + [studio-dubbing.ts](../../api/src/routes/studio-dubbing.ts) already do Whisper transcribe → LLM-translate cues (22 languages) → TTS re-synthesis. The "cloned-voice preferred" intent in the panel header is currently unreachable because the clone engine never resolves — this PRD makes it real. The marketing claim "dubbing in your own cloned voice" depends on #1991 landing.
3. **AI Value-Proposition / pitch builder → spoken pitch.** The value-prop generator's output becomes a one-click spoken pitch in the user's voice for a video resume intro.
4. **LLM-assisted clone setup.** When a user records/uploads a sample, the LLM generates the calibration read-aloud script and a suggested clone name/description from their profile — lowering the friction of creating a good reference sample. (Small, optional.)

All four resolve the engine through **one shared hook/function** — `resolveNarrationEngine({ voiceId, preferClone })` → `{ engineId, synthesize() }` — so no call site branches on `provider` or re-implements the license check. (DRY: shared component decides its own capability; consumers pass a `voiceId`, not a `canClone` boolean.)

## 5. Consent, provenance & safety (gating, not optional)

Cloning a real human voice is a legal/abuse surface. Required before GA:

- **Consent attestation at upload.** `POST /voice-clones` requires an explicit "this is my voice OR I have written permission" checkbox → persist `consent_attested_at` + `consent_text_version` on `studio_voice_clones`. Ties to ToS §9a (`project_voice_marketplace.md`).
- **Provenance watermark / disclosure.** Cloned-voice audio is AI-generated; surface a disclosure on published marketplace listings and (per the watermark policy) on free-tier exports. Evaluate an inaudible audio watermark as a fast-follow.
- **Marketplace moderation.** Public listings route through the existing moderation service before going live (reuse `moderationService`); celebrity/public-figure impersonation is a takedown category.
- **Rate + abuse limits.** Server synthesis is metered (token ledger) and rate-limited per user; bulk synthesis of a non-owned licensed voice respects the license terms.
- **Right to delete.** Deleting a clone purges the R2 sample + invalidates the synthesis cache (already cascade on `studio_voice_clones` delete; add cache-key invalidation).

## 6. Entitlement & pricing

- **Creating/using a clone** stays **Pro-gated** (`requirePro("Voice Cloning")`, already enforced on POST/PATCH).
- **Buying a licensed clone** from the marketplace is available per the existing checkout; **95/5 split + CC-on-buyer** unchanged.
- **Synthesis cost** bills the token ledger (`voice_clone_synthesis` featureKey) on the server path; the client WebGPU path is free (runs on the user's GPU) — consistent with `project_token_pricing.md` (no per-clip SKU) and `project_nle_decision.md` ($0 client render).
- Free tier keeps "1 free voice (Web Speech)"; no change.

## 7. Fallback / honesty contract

- `getEngineUnavailableReason` stays the single source of truth for "can I clone right now." If neither the client bundle nor the server provider is configured, it returns a real reason and the UI shows "Cloning unavailable — using <named voice>" **before** synthesizing, never a silent swap (closes the spirit of the marketing-accuracy gap).
- Until §3.1 ships, marketing must not imply VibeVoice is live (this is the interim half of #1991 — scope the copy, or ship the server path). The copy fix and the feature are tracked as one bundle.

## 8. Dead code / drift to resolve in-pass

- If we converge on the capability-seam rename (`clone` engine, provider-driven), drop the hardcoded `VIBEVOICE_AVAILABLE`/`VIBEVOICE_CDN` constants once the provider registry replaces them (verify zero refs first).
- `studio_voice_clones.provider` defaults to `"vibevoice"` — keep the column, honor it at synthesis time instead of branching on the engine id.

## 9. Phasing (gap register)

| Gap | Phase | What |
|---|---|---|
| **#1991** | Now | Marketing-accuracy: until a real synth path ships, scope the VibeVoice copy (don't claim it's live). Closed either by shipping #1994 or by the copy edit. |
| **#1994** | Now | Server synthesis adapter + `POST /voice-clones/:id/synthesize` (Option B), token-metered, read-through cached, output → `studio_voiceovers`. Makes cloning audible on every device. |
| **#1995** | Soon | Shared `resolveNarrationEngine()` seam + wire the dubbing panel + AI-script "Narrate in my voice" toggle through it. |
| **#1996** | Soon | Consent attestation + provenance disclosure + moderation gate on publish (§5). |
| **#1997** | Soon | Value-prop/pitch → spoken-pitch one-click; LLM-generated calibration read script on clone setup. |
| **#1998** | Mid | Client WebGPU clone bundle (Option A) behind the same seam when a production bundle is published; converge to hybrid. |
| **#1999** | Mid | Audio watermark / inaudible provenance mark on cloned exports. |
| **#2000** | Mid | Tests: synthesis adapter (happy/license-denied/cache-hit), engine resolver, consent gate, dubbing-with-clone path — real-shape fixtures per the schema-test convention. |

## 10. Open questions

1. **Server TTS provider:** does Builderforce expose a clone-capable TTS endpoint, or do we integrate a dedicated provider (and which)? Decides §3.1's adapter target and the per-second cost basis.
2. **Cost basis:** $/second of synthesized audio → token-ledger conversion rate (mirror the existing $3/M-token infra basis).
3. **Language coverage:** does the chosen clone model preserve voice identity across the dubbing panel's 22 target languages, or only a subset? Scopes the "dub in your own voice" claim.
4. **Watermark standard:** adopt an existing audio-watermark scheme or disclosure-only at GA?
