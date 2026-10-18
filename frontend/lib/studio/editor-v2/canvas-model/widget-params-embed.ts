/**
 * Widget param shapes — embed + comic + presenter + brand kinds.
 * Part of the canvas-state model; re-exported by `../canvas-state`.
 */

/** Linked-content widget — embeds a card preview of a user-owned entity
 *  (resume / job / profile / …) at a fractional position on the canvas.
 *  The widget stores only the entity reference; the preview body
 *  self-fetches via `LINKED_CONTENT_BODIES[entityKind]` (components/studio/v2/inline-bodies/registry.ts)
 *  so the canvas, the inspector, and any future render-side applier all
 *  read the same projection. Adding a new entity kind = one row in the
 *  registry; no `WidgetKind` or `WidgetParams` change.
 *
 *  See `lib/studio/editor-v2/linked-content/` for the registry. */
export interface LinkedContentWidgetParams {
  entityKind: import("@/lib/studio/editor-v2/linked-content").LinkedContentKind;
  /** Stable id of the linked entity (resume id, job id, …). Empty
   *  string means the widget hasn't been bound yet — the body renders
   *  an empty state prompting the user to pick from the inspector. */
  entityId: string;
  /** Card colours — stamped at insert time from the active theme /
   *  colour palette so a resume dropped onto a "Director Pitch"
   *  template adopts that template's look. Mirrors the CTA widget's
   *  per-widget colour pattern so `applyThemeToState` can re-stamp
   *  the chrome when the user picks a new theme. Single source of
   *  truth: `resolveLinkedContentColors()` in `linked-content/index.ts`. */
  bgColor?: string;
  textColor?: string;
  /** Subtitle / body / chip-text colour (lower-emphasis text). */
  mutedColor?: string;
  /** CTA button background + icon-chip accent. */
  accentColor?: string;
  /** CTA button text (computed for contrast against accent). */
  accentTextColor?: string;
  /** CTA pill text override. When set, replaces the kind-default label
   *  (`"View resume"` / `"Read article"` / etc) baked into
   *  `LINKED_CONTENT_REGISTRY[kind].ctaLabel`. Single seam: both the
   *  DOM `<CtaPill>` in `LinkedContentBody.tsx` AND the canvas-2D
   *  `canvas-v2:linked-content` applier read the override through the
   *  shared `resolveLinkedContentCtaLabel(kind, data)` helper, so the
   *  edit / playback / export surfaces never drift on what the button
   *  says. Empty / undefined falls back to the kind default. */
  ctaText?: string;
  /** Explicit CTA font size in canvas pixels. The canvas-2D applier
   *  used to size the pill purely from the widget's bounding box
   *  (`min(w,h) * 0.06`) — fine on large cards, illegible on tall
   *  narrow ones. When this field is set, both the DOM pill and the
   *  canvas painter use the explicit size; otherwise the canvas falls
   *  back to its bounding-box heuristic and the DOM pill uses its
   *  inherited Tailwind `text-xs` size. */
  ctaFontPx?: number;
  /** CTA font weight. `"bold"` matches the historical default; the
   *  toggle exists so a designer can dial the pill back to a normal-
   *  weight token when the card already carries plenty of bold copy. */
  ctaFontWeight?: "normal" | "bold";
  /** Font family stack for the CTA pill. Passed verbatim to canvas
   *  context.font + CSS font-family. Defaults to the surface's sans
   *  stack on both renderers when unset. */
  ctaFontFamily?: string;
  /** The link the card's CTA follows, when it differs from the entity's
   *  public page — i.e. a campaign-UTM-baked render copy. Never authored:
   *  emit always writes the canonical page (`linkedContentUrl`) and parse
   *  keeps only a different value, so a saved project never carries it. */
  ctaUrl?: string;
  /** `false` hides the link + QR an exported file paints (#2312). Absent
   *  or `true` = on; only `false` is emitted. */
  exportFallback?: boolean;
}

/** Speech-bubble widget — the dialogue / thought balloon. The bubble
 *  body is rendered by both the DOM stage and the (future) canvas-2D
 *  applier from a single `shape` enum so the editor preview and the
 *  exported pixels can't drift. `tail` carries the pointer direction
 *  and anchor — at render time the tail draws as a small triangle out
 *  of the bubble toward the anchor point. Anchor coordinates are
 *  fractional within the canvas (same convention as `WidgetPosition`),
 *  not relative to the bubble — so dragging the speaker doesn't break
 *  the tail. */
export interface SpeechBubbleWidgetParams {
  text: string;
  fontPx: number;
  fontFamily?: string;
  color: string;
  /** Bubble fill colour. */
  bgColor: string;
  /** Bubble border colour — the comic "ink". */
  strokeColor: string;
  /** Bubble border width in canvas pixels. */
  strokeWidth: number;
  /** "speech": rounded ovoid with a triangular tail (dialogue).
   *  "thought": cloud-shaped with circle puffs trailing to the speaker.
   *  "shout": jagged starburst (yelling).
   *  "whisper": dashed outline (whisper). */
  shape: "speech" | "thought" | "shout" | "whisper";
  /** Pointer tail. Null = no tail (a free-floating caption-style
   *  balloon, useful for narration set above a panel). */
  tail: {
    /** Fractional canvas coordinates of the tail tip — usually the
     *  speaker's mouth. Stored as a separate point so the bubble can
     *  move without losing its anchor. */
    anchorX: number;
    anchorY: number;
  } | null;
}

/** Caption box widget — the rectangular narration block at the top or
 *  bottom of a panel ("Meanwhile, across town…"). Distinct from a
 *  speech-bubble so the picker can surface it as a separate primitive
 *  and the scaffolder can place it deterministically (top vs bottom of
 *  the panel) without authoring a bubble shape. */
export interface CaptionBoxWidgetParams {
  text: string;
  fontPx: number;
  fontFamily?: string;
  color: string;
  bgColor: string;
  strokeColor: string;
  strokeWidth: number;
  /** Italic narration vs straight caption — affects the body font
   *  style only; everything else is shared. */
  italic: boolean;
}

/** Sound-effect widget — the chunky "POW!" / "BAM!" / "DOKI" type that
 *  reads as part of the comic art, not as dialogue. Renders as text
 *  inside a starburst or jagged-outline shape. */
export interface SfxBurstWidgetParams {
  text: string;
  fontPx: number;
  fontFamily?: string;
  /** Text fill colour. */
  color: string;
  /** Burst fill colour. */
  bgColor: string;
  /** Burst stroke (the heavy outline). */
  strokeColor: string;
  strokeWidth: number;
  /** Burst silhouette. "star": classic 12-point star.
   *  "jagged": jagged irregular polygon. "circle-jagged": rounded
   *  bumpy circle (impact). "lightning": lightning-bolt outline. */
  shape: "star" | "jagged" | "circle-jagged" | "lightning";
}

/** AI presenter avatar — 2D talking head with viseme-driven mouth
 *  shapes. `presenterId` picks from the STOCK_PRESENTERS library in
 *  `lib/studio/avatar/presenters.ts`. `script` is what the avatar should
 *  say; the inspector pipes it through the chosen TTS engine to drive
 *  mouth motion in preview, and the render pass paints visemes against
 *  the caption-cue timeline so the exported MP4 lip-syncs to the same
 *  audio that plays in the timeline (cloned-voice voiceovers ride this
 *  same lane). */
export interface AvatarWidgetParams {
  /** Presenter preset id — one of STOCK_PRESENTERS, or a future
   *  user-uploaded BYO portrait id (BYO uploads tracked in the gap
   *  register). */
  presenterId: string;
  /** Free-text script the avatar speaks. Drives both the audio (via
   *  TTS) and the viseme estimation (via `estimateVisemesForText`). */
  script: string;
  /** TTS engine id (see `frontend/lib/services/tts-engines.ts`). Defaults
   *  to "web-speech" when unset so the avatar speaks immediately even
   *  before a WebGPU engine has been picked. */
  engine?: import("@/lib/services/tts-engines").TtsEngineId;
  /** Voice id within the engine's catalogue. The Voice Cloning library
   *  surfaces user-cloned voices through this same id space, so an
   *  avatar can speak in the user's cloned voice without a separate
   *  field. */
  voiceId?: string;
  /** Speaking rate (1 = natural). Threaded into the TTS engine. */
  speed?: number;
  /** Outfit-accent colour override — lets a brand designer match the
   *  avatar's accent to a campaign palette without forking the stock
   *  preset. `null` / undefined means use the preset's default. */
  accentColor?: string | null;
  /** #1559 — BYO portrait upload. When set, the avatar painter uses
   *  the uploaded portrait (a still photo + alpha-masked mouth region)
   *  as the source for viseme overlay instead of one of the stylized
   *  STOCK_PRESENTERS. Resolved via the existing media-source
   *  abstraction so the URL + face-detect bounding-box are derived
   *  once and cached. `presenterId` still drives style fallbacks when
   *  the portrait is missing (e.g. background colour). */
  portraitSourceId?: string;
  /** #1559 — Cached face-detect bounding box for the uploaded portrait.
   *  Computed client-side via MediaPipe FaceMesh on upload + persisted
   *  to the widget params so the painter doesn't re-run detection on
   *  every render. Coordinates in source-image pixel space; the painter
   *  scales them into the widget viewport. */
  portraitFaceBbox?: { x: number; y: number; width: number; height: number };
  /** #1559 — Mouth-region polygon for the alpha-masked mouth swap.
   *  Optional — when omitted the painter falls back to a heuristic
   *  mouth rectangle derived from the face bbox. */
  portraitMouthRegion?: Array<{ x: number; y: number }>;
}

/** Engagement asset widget — embeds a per-project authored engagement
 *  artifact (lead form, chapter marker, thumbnail stamp, reviewer pin)
 *  at a fractional position on the canvas. The kind sub-axis lives in
 *  `lib/studio/editor-v2/engagement-assets.ts`'s registry so adding a
 *  new engagement kind is one row there + one inline-body component,
 *  no `WidgetKind` change here. See [[project_gap_register]] #1579. */
export interface EngagementAssetWidgetParams {
  assetKind: import("@/lib/studio/editor-v2/engagement-assets").EngagementAssetKind;
  /** Server-side id of the bound artifact (form id, chapter id,
   *  thumbnail id, comment thread id). Empty string means the widget
   *  hasn't been bound yet — the body renders an empty state prompting
   *  the user to pick from the inspector. */
  assetId: string;
  /** Card colours — stamped at insert time so a form dropped onto a
   *  dark template adopts that template's look. Same pattern as
   *  LinkedContentWidgetParams. */
  bgColor?: string;
  textColor?: string;
  accentColor?: string;
  accentTextColor?: string;
}

/** Brand kit — kit id + snapshotted logo URL so export still paints
 *  if the kit is later deleted. Opacity is independent of the shared
 *  opacity effect. Position lives on `Widget.position`. */
export interface BrandKitWidgetParams {
  /** Studio brand kit id. Empty = none picked yet. */
  brandKitId: string;
  /** Snapshotted logo URL. Empty = editor-only hint, nothing in export. */
  logoUrl: string;
  /** 0..1 logo opacity. */
  opacity: number;
}
