/**
 * Studio Media Kinds — single source of truth for the CANVAS-RUNTIME axis
 * of every studio project / template.
 *
 * The studio is a canvas product. `mediaKind` is the first-class
 * extensibility hook — it picks (1) which canvas runtime mounts in the
 * editor, (2) the toolset that runtime exposes, (3) the project-row
 * metadata, and (4) the save / export / publish pipeline. The Timeline
 * (`shared/timeline.ts`) happens to be the canvas runtime for every
 * shipping kind today (video / podcast / voice / animation) because
 * they're all time-based composition — but `image`, `cad`, `game`,
 * `interactive_comic`, `animated_film`, `xr_scene`, `3d_model` are all
 * legitimate kinds with their own canvas runtimes on the roadmap (see
 * Consolidated Gap Register entries #927 / #929 / #930 / #931 / #932).
 *
 * Distinct from `studio_projects.kind: 'scene' | 'nle'` which is a STORAGE
 * discriminator (which JSONB column to read for the Timeline runtime
 * today; future canvas runtimes add their own kind values pointing at
 * `game_state` / `cad_state` / `image_state` / etc. columns).
 *
 * Scene shape varies per runtime — time-based kinds use N scenes for N
 * time slices; static-output kinds (image, cad) are single-scene (the
 * workspace IS the scene); interactive kinds (game, comic) use scenes
 * as state-graph nodes. The shared editor shell (title / save / export /
 * AI assistant / layers chrome) stays — the center canvas swaps.
 *
 * Used everywhere the editor / template catalog / save menu / API need
 * a per-kind decision:
 *   • Frontend templates/catalog: per-template `mediaKind` field
 *   • Frontend StudioSaveMenuV2: gates which Export / Publish rows render
 *   • Frontend `deriveKindDefaults`: which editor tab / panel auto-opens
 *   • Frontend render facade: derives container + mime from output profile
 *   • Future `<CanvasRouter mediaKind/>` (#931): dispatches to the right runtime
 *   • API: studio_projects.media_kind column + zod request validation
 *   • Marketing landing pages (#900/#901): "Exports as MP4 / MP3+RSS / GIF / STL / PNG"
 *
 * Per the standing DRY rule (`feedback_extract_on_duplication`): every
 * consumer reads from this module. NEVER prop-drill a `canPublishToYouTube`
 * boolean — components self-gate by calling `outputProfilesFor(mediaKind)`
 * and `publishDestinationsFor(mediaKind)` directly.
 *
 * Adding a new mediaKind means: (1) edit this one record (enum + UI hints
 * + output profiles + publish destinations); (2) ALTER the CHECK constraint
 * migration on `studio_projects.media_kind`; (3) ship a canvas runtime
 * (or extend the Timeline runtime if the kind is time-based); (4) map
 * the kind to its state field in shared/studio-project-state.ts (state is
 * the one `studio_projects.state` column). The zod schema, the TypeScript type, the
 * export menu, and the canvas router all derive from #1 automatically.
 */

// Barrel — implementation lives in ./media-kinds/*. Modules there never
// import this file (no cycles).
export { MEDIA_KINDS, type MediaKind, isMediaKind } from "./media-kinds/kinds.js";
export {
  mediaKindHasAudio,
  mediaKindHasVideo,
  mediaKindUsesTimelineExport,
  mediaKindUsesCanvasStateAuthoring,
} from "./media-kinds/predicates.js";
export type {
  AudioCodecId,
  VideoCodecId,
  ContainerId,
  OutputProfile,
} from "./media-kinds/output-profile-types.js";
export {
  OUTPUT_PROFILES,
  outputProfilesFor,
  defaultOutputProfile,
} from "./media-kinds/output-profiles.js";
export {
  type PublishDestinationId,
  type PublishDestination,
  PUBLISH_DESTINATIONS,
  publishDestinationsFor,
} from "./media-kinds/publish-destinations.js";
export {
  type MediaKindUiHints,
  MEDIA_KIND_UI,
  MEDIA_KIND_NOT_READY_DEFAULT_KEY,
  MEDIA_KIND_NOT_READY_KEYS,
  mediaKindNotReadyKey,
} from "./media-kinds/ui-hints.js";
export {
  type MediaKindTraits,
  MEDIA_KIND_TRAITS,
  mediaKindTraits,
  mediaKindIsPrimaryVideo,
  mediaKindIsDocument,
  mediaKindIsStillImage,
  mediaKindHasFramedPreview,
  mediaKindIsComic,
  mediaKindIsFrameAnimation,
  mediaKindIsGame,
} from "./media-kinds/traits.js";
