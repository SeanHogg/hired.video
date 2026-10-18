/**
 * v2 Studio editor working format.
 *
 * The video is modelled as a list of scenes. Each scene is a contiguous
 * time slice with a background and a set of overlay widgets (text,
 * image, shape, chart) positioned on the canvas. Widgets are stored as
 * percentage offsets (0..1) so the canvas is resolution-independent —
 * the same scene renders at 1080p preview AND 4K export.
 *
 * Persistence: the editor serializes this shape to
 * `studio_projects.timelineSpec` via `canvas-state-to-timeline.ts` on
 * save. Reads round-trip through `timeline-to-canvas-state.ts`. The
 * Timeline JSON spec remains the single render input — this format is
 * an authoring convenience.
 *
 * Naming: "scene" here is a v2-editor concept (a slide-like unit on
 * the canvas), not the legacy `kind='scene'` storyboard. The legacy
 * scene editor is untouched.
 *
 * This module is the public facade: the model lives in `./canvas-model/`
 * (types, audio, migration, constructors, queries, theme) and the
 * per-widget-kind defaults / text / v1 emit in `./widget-kinds/`. Import
 * from here.
 */

export type {
  WidgetKind,
  WidgetPosition,
  WidgetTransformKeyframe,
  WidgetParams,
  ContainerStyle,
  Widget,
} from "./canvas-model/widget-types";
export { INSERTABLE_WIDGET_KINDS } from "./canvas-model/widget-types";

export type {
  TextWidgetParams,
  ImageWidgetParams,
  VideoWidgetParams,
  ChromaKeyParams,
  ShapeWidgetParams,
  DividerWidgetParams,
  ChartWidgetParams,
  WebcamWidgetParams,
  ChipsWidgetParams,
  CtaWidgetParams,
} from "./canvas-model/widget-params-core";
export { resolveCtaFontSizes } from "./canvas-model/widget-params-core";

export type {
  LinkedContentWidgetParams,
  SpeechBubbleWidgetParams,
  CaptionBoxWidgetParams,
  SfxBurstWidgetParams,
  AvatarWidgetParams,
  EngagementAssetWidgetParams,
  BrandKitWidgetParams,
} from "./canvas-model/widget-params-embed";

export type {
  SceneEnterAnimations,
  Scene,
  CanvasCaptionCue,
  CaptionStyle,
  CanvasCaptions,
  ColorPalette,
  CanvasState,
} from "./canvas-model/scene-types";
export { CANVAS_STATE_VERSION } from "./canvas-model/scene-types";

export type {
  AudioLayerKind,
  AudioLayerSource,
  AudioLayer,
  CanvasAudioMix,
  AudioLayerPatch,
} from "./canvas-model/audio-types";
export { DEFAULT_AUDIO_MIX, DEFAULT_DUCK_AMOUNT } from "./canvas-model/audio-types";

export {
  audioLaneForKind,
  makeAudioLayer,
  musicLayers,
  voiceoverLayers,
  layerPlayableSeconds,
  cloneAudioLayerWithNewId,
  updateAudioLayer,
  addAudioLayer,
  removeAudioLayer,
  layerCompositionStart,
  splitAudioLayer,
} from "./canvas-model/audio-layers";

export { audioLayerFromLegacyMusic, buildAudioLayers } from "./canvas-model/audio-migration";

export {
  emptyCanvasState,
  emptyScene,
  makeRecordingScene,
  defaultWidget,
  cloneWidgetWithNewId,
  cloneSceneWithNewIds,
} from "./canvas-model/constructors";

export { makeLinkedContentWidget, makeEngagementAssetWidget } from "./canvas-model/bound-widgets";

export { totalDurationSeconds, findWidget, findScene } from "./canvas-model/queries";
export { normalizeRotationDegrees } from "./canvas-model/geometry";

export { applyThemeToState } from "./canvas-model/theme";

export { normalizeCanvasState } from "./canvas-model/normalize";
