/**
 * eslint-page-chrome: skip — full-screen editor surface; the marketing
 * chrome (AppShell / useSEO / useBreadcrumbs) the rule enforces does not
 * apply to the Studio editor. (Opt-out surfaced once #1868 un-hid the rule.)
 *
 * v2 Studio editor shell at `/studio/:id`.
 *
 * Layout:
 *   ┌─────────┬──────────────────────────┬──────────┐
 *   │ Scenes  │                          │          │
 *   │  rail   │   Canvas stage (zoom)    │ Props    │
 *   ├─────────┤                          │  panel   │
 *   │ Widgets │                          │          │
 *   │ palette │  Timeline (bottom)       │          │
 *   └─────────┴──────────────────────────┴──────────┘
 *
 * Persistence: the editor holds CanvasState in memory, autosaves to
 * localStorage on every change (scoped to the project id), and pushes
 * Timeline JSON to the server via studioService.saveDraft on a debounced
 * cadence. The server stores `timelineSpec`; the round-trip back is via
 * timelineToCanvasState() so a project saved here re-opens identically.
 *
 * Authorization: this surface is rendered inside the same auth wrapper
 * as the classic editor. Mutations route through the existing studio
 * routes — server enforces canActFor.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ChevronUp,
  ChevronDown,
  Play,
  Pause,
  SkipBack,
  Music,
  Mic,
  Pencil,
  UserPlus,
  Download,
  Code2,
  Eye,
} from "lucide-react";
import { resolveMusic } from "@/lib/studio/music-catalog";
import { shouldShowBranding } from "@/lib/studio/branding-policy";
import { useRemoveBrandingFlag } from "@/lib/studio/use-remove-branding-flag";
import { useSubscription } from "@/lib/hooks/useSubscription";
import { promptDialog } from "@/lib/dialogs";
import {
  VISUAL_THEMES,
  BG_PRESETS,
  scenePatchFromBgPreset,
} from "@/lib/studio/visual-themes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToastAction } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { studioService, type StudioProject, type StudioPublication } from "@/lib/services/studio-service";
import { NotFoundError } from "@/lib/errors";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import StudioLoadingShell from "../StudioLoadingShell";
import { cn } from "@/lib/utils";

import {
  type CanvasAudioMix,
  type CanvasState,
  type Scene,
  type VoiceoverClip,
  type Widget,
  type WidgetKind,
  type WidgetParams,
  type WidgetPosition,
  applyThemeToState,
  cloneSceneWithNewIds,
  defaultWidget,
  DEFAULT_AUDIO_MIX,
  emptyScene,
  makeLinkedContentWidget,
  makeEngagementAssetWidget,
  makeRecordingScene,
  totalDurationSeconds,
  updateMusicTiming,
  updateVoiceoverClip,
} from "@/lib/studio/editor-v2/canvas-state";
import {
  resolveLinkedContentColors,
  type LinkedContentKind,
} from "@/lib/studio/editor-v2/linked-content";
import type { EngagementAssetKind } from "@/lib/studio/editor-v2/engagement-assets";
import {
  canvasStateToTimeline,
  resolveTimelineAudioSources,
  timelineToCanvasState,
} from "@/lib/studio/editor-v2/timeline-emit";
import { scriptToCanvasState } from "@/lib/studio/editor-v2/script-to-canvas";
import {
  computeTimelineSpecHash,
  isProjectBakedFresh,
  withBakedTimelineHash,
} from "@/lib/studio/baked-freshness";
import {
  parseStudioSubject,
  type StudioSubject,
} from "@shared/studio-subject";
import { canvasStateToScript } from "@/lib/studio/editor-v2/canvas-to-script";
import { seedCanvasFromTemplate } from "@/lib/studio/editor-v2/template-seeds";
import { deriveKindDefaults } from "@/lib/studio/editor-v2/kind-defaults";
import {
  mediaKindUsesCanvasStateAuthoring,
  type MediaKind,
} from "@shared/media-kinds";
import GameStage from "@/components/studio/game/GameStage";
import LevelsRail from "@/components/studio/game/LevelsRail";
import SpritePalette from "@/components/studio/game/SpritePalette";
import EntityPaletteLeft from "@/components/studio/game/world-3d/EntityPaletteLeft";
import Game3DPropertiesPanel from "@/components/studio/game/world-3d/Game3DPropertiesPanel";
import ChallengesPanel from "@/components/studio/game/world-3d/ChallengesPanel";
import AIAgentPanel from "@/components/studio/game/world-3d/AIAgentPanel";
import InviteDialog from "@/components/studio/game/world-3d/InviteDialog";
import PreviewLayoutGroup from "@/components/studio/nle/PreviewLayoutGroup";
import type { LayoutBindings } from "@/lib/studio/editor-v2/use-layout-preset";
import { downloadRobloxFile } from "@/lib/studio/game/roblox-export";
import GamePropertiesPanel, {
  type GameSelection,
} from "@/components/studio/game/GamePropertiesPanel";
import {
  updateSprite as gameUpdateSprite,
  addSprite as gameAddSprite,
  addCustomSpriteAsset as gameAddCustomSpriteAsset,
  normalizeStartLevelId as gameNormalizeStartLevelId,
} from "@/lib/studio/game/game-state-edit";
import { findStartLevel } from "@/lib/studio/game/runtime";
import DrawingStage from "@/components/studio/drawing/DrawingStage";
import AnimationStage from "@/components/studio/animation/AnimationStage";
import FramesRail from "@/components/studio/animation/FramesRail";
import CadStage from "@/components/studio/cad/CadStage";
import Cad3DStage from "@/components/studio/cad-3d/Cad3DStage";
import CanvasRouter from "@/components/studio/v2/CanvasRouter";
import DocumentStage from "@/components/studio/document/DocumentStage";
import DocumentLeftPanel from "@/components/studio/document/DocumentLeftPanel";
import ResumeUpload from "@/components/ResumeUpload";
import {
  type DocumentState,
  createBlankDocumentState,
  createResumeDocumentState,
} from "@/lib/studio/editor-v2/document-state";
import { resumeService } from "@/lib/services/resume-service";
import type { ResumeData, ResumeUploadResponse } from "@/types/resume";
import { getEmptyResumeData, mapContentToResumeData } from "@/lib/resume-shape";
import { printDocument } from "@/lib/studio/document/print-document";
import { articleService } from "@/lib/services/article-service";
import { documentToArticle } from "@/lib/studio/document/document-to-article";
import AttachToCourseDialog from "@/components/creator/AttachToCourseDialog";
import { type ImageState, createBlankImageState, findLayer as findImageLayer, makeVectorLayer, makeTextLayer } from "@shared/image-state";
import { spillLayersIfNeeded } from "@/lib/studio/drawing/layer-r2-spill";
import {
  type AnimationState,
  createBlankAnimationState,
  updateFramePixels,
} from "@shared/animation-state";
import { type CadState, createBlankCadState } from "@shared/cad-state";
import { type Cad3DState, createBlankCad3DState } from "@shared/cad-3d-state";
import { seedImageFromTemplate } from "@/lib/studio/image/image-seeds";
import { seedAnimationFromTemplate } from "@/lib/studio/animation/animation-seeds";
import FloatingImageLayersPanel from "@/components/studio/drawing/FloatingImageLayersPanel";
import DrawingToolPalette from "@/components/studio/drawing/DrawingToolPalette";
import DrawingAiPromptPanel from "@/components/studio/drawing/DrawingAiPromptPanel";
import MediaAiPromptPanel from "@/components/studio/ai/MediaAiPromptPanel";
import AiSelectionChip from "@/components/studio/ai/AiSelectionChip";
import {
  clearSelectionOnLayer,
  compositeImageIntoSelection,
  drawBlobToCanvasFit,
  fillSelectionOnLayer,
  flattenCanvasToBlob,
  hydrateLayerCanvas,
  serializeLayer,
  createOffscreenCanvas,
} from "@/lib/studio/drawing/drawing-engine";
import { generateImage } from "@/lib/services/image-gen-engine";
import type { MarqueeSelection } from "@/components/studio/drawing/DrawingStage";
import {
  DEFAULT_BRUSH,
  MAX_RECENT_COLORS,
  type BrushSettings,
  type DrawingTool,
} from "@/lib/studio/drawing/drawing-types";
import { uploadImage } from "@/lib/services/upload-service";
import type { ImageGenResult } from "@/lib/services/image-gen-engine";
import { TEMPLATE_CATALOG } from "@/components/studio/templates/catalog";
import { slugToBuiltinId } from "@/lib/templates/registry";
import { usePreviewPlayback } from "@/lib/studio/editor-v2/use-preview-playback";
import { usePublications } from "@/lib/studio/editor-v2/use-publications";
import { useCanvasHistory } from "@/lib/studio/editor-v2/use-canvas-history";
import { useCanvasClipboard } from "@/lib/studio/editor-v2/use-canvas-clipboard";
import { useStudioShortcuts } from "@/lib/studio/editor-v2/use-studio-shortcuts";
import { useScreenshotCapture } from "@/lib/studio/editor-v2/use-screenshot-capture";
import { useKindHydration } from "@/lib/studio/editor-v2/use-kind-hydration";
import { runtimeStatePayload } from "@/lib/studio/editor-v2/runtime-state-payload";
import { exportProjectByKind, extensionForBlob } from "@/lib/studio/editor-v2/export-facade";

import ScenesRail from "@/components/studio/v2/ScenesRail";
import WidgetPalette, {
  insertableWidgetKindsFor,
} from "@/components/studio/v2/WidgetPalette";
import FloatingLayersPanel from "@/components/studio/v2/FloatingLayersPanel";
import CanvasStage, { type Selection } from "@/components/studio/v2/CanvasStage";
import CollapsiblePanel from "@/components/studio/v2/CollapsiblePanel";
import PropertiesPanel from "@/components/studio/v2/PropertiesPanel";
import ZoomControl from "@/components/studio/v2/ZoomControl";
import CanvasEditToolbar from "@/components/studio/v2/CanvasEditToolbar";
import SubjectSeedBanner from "@/components/studio/v2/SubjectSeedBanner";
import AdvancedTimeline from "@/components/studio/v2/AdvancedTimeline";
import ActionsPanel, { type ActionId } from "@/components/studio/v2/ActionsPanel";
import {
  registerStudioEditor,
  unregisterStudioEditor,
  type StudioEditorHandle,
  type StudioRecordingMode,
} from "@/lib/studio/editor-v2/studio-editor-bridge";
import { PageEmbedDialog } from "@/components/studio/PageEmbedDialog";
import { isSuperAdminFromToken } from "@/lib/auth-claims";
import AudioEmptyHint from "@/components/studio/v2/AudioEmptyHint";
import PreviewOverlay from "@/components/studio/v2/PreviewOverlay";
import DocumentPreviewOverlay from "@/components/studio/document/DocumentPreviewOverlay";
import StudioSaveMenuV2 from "@/components/studio/v2/StudioSaveMenuV2";
import { useProjectChrome } from "@/components/studio/shared/ProjectChromeMenu";
import ProjectDetailsSheet from "@/components/studio/shared/ProjectDetailsSheet";
import { studioTemplatesService } from "@/lib/services/studio-templates-service";
import type { VideoScript } from "@/types/video-script";

const LinkedInPublisher = lazy(
  () => import("@/components/studio/LinkedInPublisher"),
);

const LOCAL_STORAGE_PREFIX = "studio.v2.draft.";
const AUTOSAVE_DEBOUNCE_MS = 800;

/** Pull the server's machine-readable error code off an ApiClient error.
 *  NetworkError stashes the original code under `context.serverCode`; typed
 *  errors expose `code` directly. Used to branch on YOUTUBE_NOT_CONNECTED. */
function serverCodeOf(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as { context?: { serverCode?: unknown }; code?: unknown };
  const code = e.context?.serverCode ?? e.code;
  return typeof code === "string" ? code : undefined;
}

export default function StudioEditorV2() {
  const { id: routeId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  // Branding-policy inputs — `shouldShowBranding()` is the single seam
  // every surface reads (DOM `<BrandWatermark/>` on screen, the encoder
  // pill on export). Mounting the hooks here lets `renderToBlob()` pass
  // the resolved flag into `renderTimeline()` so the MP4 carries the
  // SAME pill the editor + /v/<id> show.
  const subscription = useSubscription();
  const { removeBranding } = useRemoveBrandingFlag();

  const projectId = routeId ?? "new";
  // `?contentTemplate=` matches the chooser's emit + classic editor convention.
  // `?template=` was the original v2 param; keep it as a fallback so any v2
  // bookmarks made during the beta still resolve to the right seed.
  const templateHint =
    searchParams.get("contentTemplate") ?? searchParams.get("template");
  // `?studioTemplate=<slug>` arrives from the marketplace "Use this template"
  // button (use-apply-template emits this for studio-creator kind). The hint
  // is resolved asynchronously below — initial state still hydrates from
  // built-in template seeds; the creator-template fetch then overrides it.
  const studioTemplateSlug = searchParams.get("studioTemplate");
  // `?subject=<kind>:<id>` arrives from every entity-card "Create"
  // deep-link (ResumeCard, JobActionsMenu, PeopleCard, CompanyCard,
  // EntityMedia). Parsed once on mount; carried as a pending attachment
  // that ships with the FIRST saveDraft call so the freshly-created
  // project is bound to the source entity. v1 already did this in
  // StudioLayout; this closes the v2-side gap so "Create video from
  // Resume / Job / Company / Profile" actually lands a linked project.
  const urlSubject = useMemo<StudioSubject | null>(
    () => parseStudioSubject(searchParams.get("subject")),
    // We deliberately read this ONCE — subsequent searchParam changes
    // (e.g. internal navigations) shouldn't re-arm the attach.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  // `?capture=screen|webcam|screen+webcam` arrives from the chrome
  // extension side panels + any "Record promo" CTA. Read once on mount
  // so the ActionsPanel auto-opens the matching recorder sheet and the
  // left rail starts on the Actions tab. v1 wired this; v2 was the gap
  // (#651). Mapped here from URL value → ActionsPanel.ActionId.
  const urlCapture = useMemo<"webcam" | "screen" | "screen-pip" | null>(() => {
    const raw = searchParams.get("capture");
    if (raw === "webcam") return "webcam";
    if (raw === "screen") return "screen";
    if (raw === "screen+webcam") return "screen-pip";
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kind-aware editor defaults — landing tab + advanced-timeline open +
  // ActionsPanel auto-arm. Resolved via the shared `deriveKindDefaults`
  // helper in `kind-defaults.ts` (single SoT, DRY).
  //
  // We resolve TWICE because the useState initialisers below need a
  // synchronous mount-time value (can't await server-load), but the
  // ActionsPanel auto-arm needs the LIVE kind (otherwise an existing
  // podcast project opened via direct `/studio/:id` URL falls back to
  // video defaults at mount and never re-arms when the post-load
  // effect flips `leftTab` to "actions"):
  //
  //   - mountTimeTemplateKind: kind from URL `?contentTemplate=` if
  //     present, else `'video'`. Used for the useState initialisers
  //     so freshly-from-template flow lands on the right tab from
  //     first paint when the chooser forwards the template id.
  //   - currentMediaKind: the persisted project's kind once server-load
  //     completes, else the mount-time kind. ActionsPanel reads its
  //     `defaultOpenAction` from this so it auto-arms the correct
  //     sub-sheet for existing podcast / voice projects.
  const mountTimeTemplateKind = useMemo<MediaKind>(() => {
    if (!templateHint) return "video";
    // `templateHint` may be either the raw `ContentTemplate` id
    // (`podcast_episode`) or the URL-friendly kebab slug
    // (`podcast-episode`) depending on the caller. Normalise via
    // `slugToBuiltinId` (single SoT in `lib/templates/registry`)
    // so the editor accepts both forms identically.
    const resolvedId = slugToBuiltinId(templateHint) ?? templateHint;
    const tpl = TEMPLATE_CATALOG.find((t) => t.id === resolvedId);
    return tpl?.mediaKind ?? "video";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const mountTimeDefaults = useMemo(
    () => deriveKindDefaults(mountTimeTemplateKind, urlCapture),
    // Mount-time only — `urlCapture` + templateHint are read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Canvas state lives behind the history wrapper so every mutator
  // call participates in undo/redo. The (state, setState) pair is the
  // same shape useState would give us, so the rest of the editor
  // doesn't need to know history is in play.
  //
  // Selection + activeSceneId sidecar (#592): pro NLEs restore selection
  // alongside content on undo/redo so the user doesn't have to re-click
  // the widget they were editing. The refs below are populated by the
  // useState declarations further down — capture/restore close over the
  // refs (not the values) so the wiring stays valid through the
  // top-down render order.
  const selectionRef = useRef<Selection | null>(null);
  const activeSceneIdRef = useRef<string | null>(null);
  const setSelectionRef = useRef<((s: Selection) => void) | null>(null);
  const setActiveSceneIdRef = useRef<((id: string) => void) | null>(null);
  const history = useCanvasHistory<
    CanvasState,
    { selection: Selection | null; activeSceneId: string | null }
  >(() => hydrateInitialState(projectId, templateHint), {
    sidecar: {
      capture: () => ({
        selection: selectionRef.current,
        activeSceneId: activeSceneIdRef.current,
      }),
      restore: (s) => {
        if (s.selection !== null) setSelectionRef.current?.(s.selection);
        if (s.activeSceneId !== null) setActiveSceneIdRef.current?.(s.activeSceneId);
      },
    },
  });
  const { state, setState, undo, redo, canUndo, canRedo, reset: resetHistory, commit: commitHistory } = history;
  const [title, setTitle] = useState<string>(t("studio.editor.untitledVideo"));
  const [persistedProjectId, setPersistedProjectId] = useState<string | null>(
    projectId === "new" ? null : projectId,
  );
  // Full StudioProject envelope — keeps isPublic / subjects / videoUrl
  // around for the shared <ProjectChromeMenu>. Updated on every server
  // round-trip (load, save, clone, visibility toggle).
  const [persistedProject, setPersistedProject] = useState<StudioProject | null>(null);
  // Live kind derivation — re-runs when persistedProject's mediaKind
  // changes. Drives ActionsPanel.defaultOpenAction + the AudioEmptyHint
  // banner so the sub-sheet auto-arms at the moment the panel mounts
  // (which is when the post-load effect flips leftTab to "actions" for
  // existing audio-only projects opened via direct URL).
  const currentMediaKind: MediaKind = persistedProject?.mediaKind ?? mountTimeTemplateKind;
  // Single gate for every Timeline-runtime chrome surface (ScenesRail /
  // WidgetPalette / TimelineDock / playback scrubber / Preview overlay
  // / PropertiesPanel). Closes #936 by routing the editor's "should I
  // mount CanvasStage chrome?" decision through ONE predicate instead
  // of per-surface `=== "game"` branches. Game + image self-host their
  // own canvas runtimes and own their own UIs; mounting the Timeline
  // shell around them surfaced misleading "Scene 1 / Duration /
  // Widgets / Timeline scrubber / Preview" chrome (the bug the user
  // reported on a memory_match game). Comic stays on the Timeline
  // shell because it authors via CanvasState even though its export
  // pipeline is non-Timeline.
  const usesTimelineChrome = mediaKindUsesCanvasStateAuthoring(currentMediaKind);
  // Sticky banner shown when the route id resolves to nothing the caller
  // can read — the API returns 404 for both "doesn't exist" and "no
  // access" (deliberate, see studio.ts comment), so the message stays
  // generic. Setting this also nulls `persistedProjectId` above so the
  // first save creates a fresh project instead of trying to write under
  // the unreadable id.
  const [missingProject, setMissingProject] = useState(false);
  // Image-runtime state for `mediaKind: "image"` projects (#932). Lives
  // alongside the Timeline `state` (CanvasState) and the
  // `persistedProject.gameState` — each canvas runtime owns its own
  // state model per PRD §1.2. The history wrapper is the SAME generic
  // `useCanvasHistory<T>` the Timeline runtime uses (DRY — no parallel
  // history implementation); seeded with a blank state so the hook can
  // mount unconditionally and the host's `<CanvasEditToolbar/>` can
  // drive undo/redo without a kind branch. The blank seed is harmless
  // for non-image projects — the hook holds the state in memory but
  // nothing reads it.
  const imageHistory = useCanvasHistory<ImageState>(() => createBlankImageState());
  const {
    state: imageState,
    setState: setImageState,
    undo: imageUndo,
    redo: imageRedo,
    canUndo: imageCanUndo,
    canRedo: imageCanRedo,
    commit: imageCommit,
    reset: resetImageHistory,
  } = imageHistory;
  // Tracks whether the image-runtime state has been hydrated for the
  // current project (or seeded for a fresh image-kind draft). Distinct
  // from the always-present `imageState` blank seed above — the host
  // mounts `<DrawingStage/>` only when this flag is true to avoid a
  // flash of the blank canvas before the persisted project loads.
  const [imageStateHydrated, setImageStateHydrated] = useState(false);
  // Animation runtime state — same parallel-history pattern as
  // imageHistory above. The history wrapper is mounted unconditionally
  // (DRY: same `useCanvasHistory<T>` the Timeline + image runtimes use)
  // so the editor's undo/redo chrome doesn't fork by kind.
  const animationHistory = useCanvasHistory<AnimationState>(() => createBlankAnimationState());
  const {
    state: animationState,
    setState: setAnimationState,
    commit: animationCommit,
    reset: resetAnimationHistory,
    undo: animationUndo,
    redo: animationRedo,
    canUndo: animationCanUndo,
    canRedo: animationCanRedo,
  } = animationHistory;
  const [animationStateHydrated, setAnimationStateHydrated] = useState(false);
  // Animation playback — lifted out of `<AnimationStage>` so the
  // Play/Pause control lives in the studio HEADER (where video's Play and
  // game's Playtest live), not embedded in the canvas. The stage's rAF
  // loop reads this flag via its `isPlaying` prop.
  const [animationPlaying, setAnimationPlaying] = useState(false);
  // Structural frame edit (add / duplicate / delete / reorder) — applies
  // the new state AND pushes a history checkpoint so undo works. Selection
  // changes go through `setAnimationState` directly (ephemeral, no
  // checkpoint), matching how scene / level selection behaves.
  const commitAnimationState = useCallback(
    (next: AnimationState) => {
      setAnimationState(next);
      animationCommit();
    },
    [setAnimationState, animationCommit],
  );
  const selectAnimationFrame = useCallback(
    (frameId: string) => {
      setAnimationState((prev) => ({ ...prev, activeFrameId: frameId }));
    },
    [setAnimationState],
  );
  // CAD runtime state (#930) — same parallel-history pattern as the
  // image + animation runtimes. The history wrapper is mounted
  // unconditionally so undo/redo participates without a per-kind
  // branch.
  const cadHistory = useCanvasHistory<CadState>(() => createBlankCadState());
  const {
    state: cadState,
    setState: setCadState,
    commit: cadCommit,
    reset: resetCadHistory,
  } = cadHistory;
  const [cadStateHydrated, setCadStateHydrated] = useState(false);
  // 3D CAD runtime state (#930 Phase 2) — same parallel-history pattern
  // as the 2D CAD runtime. Rides the same Three.js + R3F stack as the
  // 3D World game studio (per [[project_3d_world_game_studio]]).
  const cad3DHistory = useCanvasHistory<Cad3DState>(() => createBlankCad3DState());
  const {
    state: cad3DState,
    setState: setCad3DState,
    commit: cad3DCommit,
    reset: resetCad3DHistory,
  } = cad3DHistory;
  const [cad3DStateHydrated, setCad3DStateHydrated] = useState(false);
  // Document runtime state (#1912) — paged WYSIWYG resume / job / article /
  // blog. Same parallel-history pattern as the other non-Timeline runtimes;
  // shape in `editor-v2/document-state.ts`.
  const documentHistory = useCanvasHistory<DocumentState>(() =>
    createBlankDocumentState("resume", () => crypto.randomUUID()),
  );
  const {
    state: documentState,
    setState: setDocumentState,
    commit: documentCommit,
    reset: resetDocumentHistory,
    undo: documentUndo,
    redo: documentRedo,
    canUndo: documentCanUndo,
    canRedo: documentCanRedo,
  } = documentHistory;
  const [documentStateHydrated, setDocumentStateHydrated] = useState(false);
  // The bound entity's CONTENT for a document project (resume today). Lives
  // separately from DocumentState (which is layout/structure) — content is
  // owned by the resume row. Seeded blank for a fresh draft; fetched from the
  // resume row when DocumentState.entityId is set; persisted back on save.
  const [documentEntityContent, setDocumentEntityContent] = useState<ResumeData | null>(null);
  // Captured by DrawingStage so the host can flatten the composite on
  // Export / Save-to-library without DrawingStage needing its own
  // header buttons (single chrome, kind-aware action — per DRY).
  const [imageCanvas, setImageCanvas] = useState<HTMLCanvasElement | null>(null);
  // Save-to-library is async + needs a busy state to disable the host's
  // SaveMenu while in flight.
  const [savingImageToLibrary, setSavingImageToLibrary] = useState(false);
  // Tool + brush state lifted from DrawingStage so the LEFT-rail
  // `<DrawingToolPalette/>` (mounted by the host inside the same
  // `<CollapsiblePanel/>` Timeline kinds use for ScenesRail) drives
  // them. Per DRY the canvas + the palette read from the same state —
  // there's no parallel state-mirror.
  const [imageTool, setImageTool] = useState<DrawingTool>("brush");
  const [imageBrush, setImageBrush] = useState<BrushSettings>(DEFAULT_BRUSH);
  const [imageRecentColors, setImageRecentColors] = useState<string[]>([]);
  const pushImageRecentColor = useCallback((color: string) => {
    setImageRecentColors((prev) => {
      const filtered = prev.filter((c) => c !== color);
      return [color, ...filtered].slice(0, MAX_RECENT_COLORS);
    });
  }, []);
  // Marquee selection rect for image-kind projects — lives at the host
  // level so the Delete handler + future keyboard shortcuts can read
  // it without DrawingStage being in the path. Cleared whenever the
  // active tool changes away from `marquee` so a stale rect doesn't
  // linger when the user picks the brush.
  const [imageMarquee, setImageMarquee] = useState<MarqueeSelection | null>(null);
  // Clear the selection whenever the user switches AWAY from any
  // selection-emitting tool. Selection-emitting tools today: marquee,
  // lasso, magic-wand, quick-select. Brush / eraser / fill / hand
  // don't produce selections so leaving a stale rect when switching
  // would be confusing.
  useEffect(() => {
    const isSelectionTool =
      imageTool === "marquee" ||
      imageTool === "lasso" ||
      imageTool === "magic-wand" ||
      imageTool === "quick-select";
    if (!isSelectionTool && imageMarquee !== null) setImageMarquee(null);
  }, [imageTool, imageMarquee]);

  // ─── Image-runtime layer-mutation handlers (lifted from DrawingStage) ──
  // These live in the host so the SHARED `<FloatingImageLayersPanel/>`
  // (mounted by the host alongside the Timeline `<FloatingLayersPanel/>`)
  // can drive them without DrawingStage being in the path. Per the DRY
  // rule the rules ("can't delete the last layer", "active layer
  // selection follows deletion") live ONCE here.
  const handleImageAddLayer = useCallback(() => {
    handleImageAddLayerOfKind("raster");
  }, []);
  const handleImageAddLayerOfKind = useCallback(
    (kind: import("@shared/image-state").LayerKind) => {
      setImageState((prev) => {
        let layer: import("@shared/image-state").ImageLayer;
        const baseLabel = `Layer ${prev.layers.length + 1}`;
        if (kind === "vector") {
          layer = makeVectorLayer(baseLabel);
        } else if (kind === "text") {
          layer = makeTextLayer(baseLabel);
        } else {
          layer = {
            id: `layer-${Math.random().toString(36).slice(2, 10)}`,
            label: baseLabel,
            kind: "raster",
            opacity: 1,
            visible: true,
            locked: false,
            blendMode: "normal",
            pixelsDataUrl: null,
          };
        }
        return {
          ...prev,
          layers: [...prev.layers, layer],
          activeLayerId: layer.id,
        };
      });
      imageCommit();
    },
    [setImageState, imageCommit],
  );
  const handleImageDeleteLayer = useCallback(
    (layerId: string) => {
      setImageState((prev) => {
        if (prev.layers.length <= 1) return prev;
        const next = prev.layers.filter((l) => l.id !== layerId);
        return {
          ...prev,
          layers: next,
          activeLayerId:
            prev.activeLayerId === layerId
              ? (next[next.length - 1]?.id ?? prev.activeLayerId)
              : prev.activeLayerId,
        };
      });
      imageCommit();
    },
    [setImageState, imageCommit],
  );
  const handleImageSelectLayer = useCallback(
    (layerId: string) => {
      setImageState((prev) =>
        findImageLayer(prev, layerId) ? { ...prev, activeLayerId: layerId } : prev,
      );
      imageCommit();
    },
    [setImageState, imageCommit],
  );
  const handleImageToggleVisible = useCallback(
    (layerId: string) => {
      setImageState((prev) => ({
        ...prev,
        layers: prev.layers.map((l) =>
          l.id === layerId ? { ...l, visible: !l.visible } : l,
        ),
      }));
      imageCommit();
    },
    [setImageState, imageCommit],
  );
  const handleImageRenameLayer = useCallback(
    (layerId: string, label: string) => {
      setImageState((prev) => ({
        ...prev,
        layers: prev.layers.map((l) =>
          l.id === layerId ? { ...l, label } : l,
        ),
      }));
      imageCommit();
    },
    [setImageState, imageCommit],
  );
  const handleImageSetOpacity = useCallback(
    (layerId: string, opacity: number) => {
      setImageState((prev) => ({
        ...prev,
        layers: prev.layers.map((l) =>
          l.id === layerId ? { ...l, opacity } : l,
        ),
      }));
    },
    [setImageState],
  );
  /** Set a layer's blend mode (#940 Image Phase 2). Routes through the
   *  same history-aware setter as the opacity handler — undo/redo
   *  participates by reading from the canvas-history wrapper. */
  const handleImageSetBlendMode = useCallback(
    (layerId: string, blendMode: import("@shared/image-state").LayerBlendMode) => {
      setImageState((prev) => ({
        ...prev,
        layers: prev.layers.map((l) =>
          l.id === layerId ? { ...l, blendMode } : l,
        ),
      }));
      imageCommit();
    },
    [setImageState, imageCommit],
  );
  /** Patch a layer's filter chain (#940 Image Phase 2). Non-destructive
   *  — the layer's `pixelsDataUrl` is untouched; toggling filters off
   *  restores the original pixels. */
  const handleImageSetFilters = useCallback(
    (layerId: string, filters: import("@shared/image-state").LayerFilters | undefined) => {
      setImageState((prev) => ({
        ...prev,
        layers: prev.layers.map((l) =>
          l.id === layerId ? { ...l, filters } : l,
        ),
      }));
      imageCommit();
    },
    [setImageState, imageCommit],
  );
  const handleImageMoveLayer = useCallback(
    (layerId: string, direction: "up" | "down") => {
      setImageState((prev) => {
        // ImageState stores bottom-first; "up" in the display (top of
        // the stack) means later in the array.
        const idx = prev.layers.findIndex((l) => l.id === layerId);
        if (idx < 0) return prev;
        const offset = direction === "up" ? 1 : -1;
        const target = idx + offset;
        if (target < 0 || target >= prev.layers.length) return prev;
        const next = [...prev.layers];
        const [moved] = next.splice(idx, 1);
        next.splice(target, 0, moved);
        return { ...prev, layers: next };
      });
      imageCommit();
    },
    [setImageState, imageCommit],
  );

  // Save-to-library: flatten the live composite canvas via the shared
  // helper, upload through the SAME `uploadImage()` port MediaPicker
  // uses, toast on success. Wired to the SaveMenu's `asset-library`
  // publish destination handler so the action surfaces in the same
  // dropdown as Export / Profile gallery — no duplicate "Save to
  // library" button on the DrawingStage itself.
  const handleSaveImageToLibrary = useCallback(async () => {
    if (!imageCanvas || savingImageToLibrary) return;
    setSavingImageToLibrary(true);
    try {
      const blob = await flattenCanvasToBlob(imageCanvas, "image/png");
      const url = await uploadImage(blob, `drawing-${Date.now()}.png`);
      toast({
        title: t("studio.editor.savedToLibraryTitle"),
        description: t("studio.editor.savedToLibraryDesc"),
      });
      return url;
    } catch (err) {
      toast({
        title: t("errors.saveFailed"),
        description: err instanceof Error ? err.message : t("errors.unknownError"),
        variant: "destructive",
      });
    } finally {
      setSavingImageToLibrary(false);
    }
  }, [imageCanvas, savingImageToLibrary, toast]);

  // Selection actions — Delete clears pixels inside the selection on
  // the active layer; Fill paints the selection with the current
  // brush color. Both dispatch through the shared kind-aware engine
  // helpers (`clearSelectionOnLayer` / `fillSelectionOnLayer`) — ONE
  // pair of functions handles rect / path (lasso) / mask (magic-wand,
  // quick-select) shapes. Per DRY adding a future selection tool
  // (elliptical, polygonal) means zero changes here.
  const applyMarqueeOp = useCallback(
    async (op: "delete" | "fill") => {
      if (!imageMarquee) return;
      const layer = findImageLayer(imageState, imageState.activeLayerId);
      if (!layer || layer.locked) return;
      const offscreen = createOffscreenCanvas(imageState.width, imageState.height);
      await hydrateLayerCanvas(offscreen, layer.pixelsDataUrl);
      const ctx = offscreen.getContext("2d");
      if (!ctx) return;
      if (op === "delete") {
        clearSelectionOnLayer(ctx, imageState.width, imageState.height, imageMarquee);
      } else {
        fillSelectionOnLayer(
          ctx,
          imageState.width,
          imageState.height,
          imageMarquee,
          imageBrush.color,
        );
        pushImageRecentColor(imageBrush.color);
      }
      const pixels = serializeLayer(offscreen);
      setImageState((prev) => ({
        ...prev,
        layers: prev.layers.map((l) =>
          l.id === layer.id ? { ...l, pixelsDataUrl: pixels } : l,
        ),
      }));
      imageCommit();
      setImageMarquee(null);
    },
    [imageMarquee, imageState, imageBrush.color, pushImageRecentColor, setImageState, imageCommit],
  );
  const handleImageMarqueeDelete = useCallback(() => void applyMarqueeOp("delete"), [applyMarqueeOp]);
  const handleImageMarqueeFill = useCallback(() => void applyMarqueeOp("fill"), [applyMarqueeOp]);

  // AI inpaint (#1103) — when a selection is active, prompts the user
  // for a description, generates an image (img→img if the active
  // layer has pixels), composites the result MASKED to the selection.
  // The rest of the active layer's pixels are preserved.
  const handleImageMarqueeInpaint = useCallback(async () => {
    if (!imageMarquee) return;
    const promptText = await promptDialog({
      title: t("studio.editor.aiFillTitle"),
      description: t("studio.editor.aiFillDesc"),
      placeholder: t("studio.editor.aiFillPlaceholder"),
      multiline: true,
      required: true,
      confirmText: t("actions.generate"),
    });
    if (!promptText || promptText.trim().length < 3) return;
    const layer = findImageLayer(imageState, imageState.activeLayerId);
    if (!layer || layer.locked) return;
    try {
      const result = await generateImage({
        prompt: promptText.trim(),
        width: imageState.width,
        height: imageState.height,
      });
      const offscreen = createOffscreenCanvas(imageState.width, imageState.height);
      await hydrateLayerCanvas(offscreen, layer.pixelsDataUrl);
      const ctx = offscreen.getContext("2d");
      if (!ctx) return;
      const img = new Image();
      const url = URL.createObjectURL(result.blob);
      try {
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Failed to decode AI result"));
          img.src = url;
        });
      } finally {
        URL.revokeObjectURL(url);
      }
      compositeImageIntoSelection(ctx, imageState.width, imageState.height, img, imageMarquee);
      const pixels = serializeLayer(offscreen);
      setImageState((prev) => ({
        ...prev,
        layers: prev.layers.map((l) =>
          l.id === layer.id ? { ...l, pixelsDataUrl: pixels } : l,
        ),
        aiPromptHistory: [
          ...prev.aiPromptHistory,
          {
            id: `prompt-${Math.random().toString(36).slice(2, 10)}`,
            prompt: `[inpaint] ${promptText.trim()}`,
            at: new Date().toISOString(),
            engineId: result.engine,
            ...(result.resultUrl ? { resultUrl: result.resultUrl } : {}),
          },
        ].slice(-50),
      }));
      imageCommit();
      setImageMarquee(null);
      URL.revokeObjectURL(result.previewUrl);
    } catch (err) {
      toast({
        title: t("studio.editor.aiFillFailed"),
        description: err instanceof Error ? err.message : t("errors.unknownError"),
        variant: "destructive",
      });
    }
  }, [imageMarquee, imageState, setImageState, imageCommit, toast, t]);

  // Hand-tool transform commit — DrawingStage's TransformHandles emit
  // the combined offset / scale / rotation; the host writes it back to
  // the active layer's transform fields. Per DRY the host owns the
  // layer-mutation handler; DrawingStage just renders the chrome.
  const handleImageLayerTransform = useCallback(
    (next: { offset: { x: number; y: number }; scale: { x: number; y: number }; rotation: number }) => {
      const layerId = imageState.activeLayerId;
      setImageState((prev) => ({
        ...prev,
        layers: prev.layers.map((l) =>
          l.id === layerId
            ? {
                ...l,
                transformOffset: next.offset,
                transformScale: next.scale,
                transformRotation: next.rotation,
              }
            : l,
        ),
      }));
    },
    [imageState.activeLayerId, setImageState],
  );

  // AI-result layer insert — appends a new layer with the generated
  // pixels + records one entry on `aiPromptHistory`. Lives in the host
  // (alongside the layer-mutation handlers) so the right-rail-mounted
  // `<DrawingAiPromptPanel/>` can call it without DrawingStage being
  // in the path.
  const handleImageAiGenerated = useCallback(
    async (
      result: ImageGenResult,
      prompt: string,
      options: { replaceActiveLayer: boolean; hadTransparentIntent: boolean },
    ) => {
      const dataUrl = await drawBlobToCanvasFit(
        result.blob,
        imageState.width,
        imageState.height,
      );
      const historyEntry = {
        id: `prompt-${Math.random().toString(36).slice(2, 10)}`,
        prompt,
        at: new Date().toISOString(),
        engineId: result.engine,
        ...(result.resultUrl ? { resultUrl: result.resultUrl } : {}),
      };
      if (options.replaceActiveLayer) {
        // Overwrite the active layer's pixels — useful for iteration
        // on a specific layer ("regenerate this one"). Preserves the
        // layer's id / label / opacity / visibility / position in the
        // stack — only pixels change. Per the user's ask, the AI can
        // update existing layers (not just append new ones).
        setImageState((prev) => ({
          ...prev,
          layers: prev.layers.map((l) =>
            l.id === prev.activeLayerId ? { ...l, pixelsDataUrl: dataUrl } : l,
          ),
          aiPromptHistory: [...prev.aiPromptHistory, historyEntry].slice(-50),
        }));
      } else {
        // Append as a new layer at the top of the stack — the default,
        // non-destructive path. Label includes the prompt prefix; the
        // transparent flag annotates the label so the user can tell
        // background-removed layers apart at a glance.
        const newLayerId = `layer-${Math.random().toString(36).slice(2, 10)}`;
        const labelPrefix = options.hadTransparentIntent ? "AI · cut-out" : "AI";
        setImageState((prev) => ({
          ...prev,
          layers: [
            ...prev.layers,
            {
              id: newLayerId,
              label: `${labelPrefix}: ${prompt.slice(0, 24)}${prompt.length > 24 ? "…" : ""}`,
              kind: "raster",
              opacity: 1,
              visible: true,
              locked: false,
              blendMode: "normal",
              pixelsDataUrl: dataUrl,
            },
          ],
          activeLayerId: newLayerId,
          aiPromptHistory: [...prev.aiPromptHistory, historyEntry].slice(-50),
        }));
      }
      imageCommit();
    },
    [imageState.width, imageState.height, setImageState, imageCommit],
  );

  // AI-result animation-frame insert — overwrites the active frame's
  // pixels (default UX is "regenerate this frame"). Mirrors the
  // image-kind handler shape so the right-rail panel can call it
  // without AnimationStage being in the path. Cross-studio first-class
  // AI rollout: animation kind now has the same prompt UX as drawing.
  const handleAnimationAiGenerated = useCallback(
    async (result: ImageGenResult) => {
      const dataUrl = await drawBlobToCanvasFit(
        result.blob,
        animationState.width,
        animationState.height,
      );
      setAnimationState((prev) =>
        updateFramePixels(prev, prev.activeFrameId, dataUrl),
      );
      animationCommit();
    },
    [animationState.width, animationState.height, setAnimationState, animationCommit],
  );

  // Game-runtime state for `mediaKind: "game"` projects (#939 Phase 2b).
  // Same shape as `imageState` — local state hydrated from
  // `persistedProject.gameState`, edited via the shared shell (LevelsRail /
  // mirrored back through `handleSave`. Null for non-game projects (and
  // for game projects whose template seed hasn't reached the editor yet
  // on a brand-new draft). Per PRD §1.2 each canvas runtime owns its
  // own state model.
  const [gameState, setGameState] = useState<import("@shared/game-state").GameState | null>(null);
  // Game editor selection — `GameSelection` discriminated union:
  //   - { kind: "canvas" } → game settings panel
  //   - { kind: "level", levelId } → level inspector
  //   - { kind: "sprite", levelId, spriteId } → sprite inspector
  // Lifted to the editor shell so the canvas, levels rail, sprite
  // palette, and right-rail properties panel all read the same source.
  // Parallel to the Timeline editor's `Selection` model; the two
  // never co-exist because at most one runtime is mounted per
  // project. `activeLevelId` is derived from selection for runtime
  // convenience (the canvas needs a level id to render).
  const [gameSelection, setGameSelection] = useState<GameSelection>({ kind: "canvas" });
  const activeLevelId =
    gameSelection.kind === "level" || gameSelection.kind === "sprite"
      ? gameSelection.levelId
      : null;
  const selectedSpriteId =
    gameSelection.kind === "sprite" ? gameSelection.spriteId : null;

  // Game-kind AI-result handler — registers the generated PNG as a new
  // custom sprite asset and mints a fresh sprite on the active level.
  // Asset URL is the durable R2 CDN URL the route already persists, so
  // the runtime preloads it the same way it preloads user-uploaded
  // sprites. Per the cross-studio first-class AI rollout: game kind
  // gets the same prompt UX as drawing — type a prompt, get a sprite.
  const handleGameAiGenerated = useCallback(
    (result: ImageGenResult, prompt: string) => {
      if (!gameState) return;
      // Asset URL — server-side R2 path. Fall back to the blob URL only
      // for the (currently unreachable) WebGPU client engine; that path
      // can't reload across sessions, but at least the user sees the
      // sprite in this session.
      const url = result.resultUrl ?? result.previewUrl;
      const levelId = activeLevelId ?? findStartLevel(gameState)?.id;
      if (!levelId) return;
      const assetId = `ai-${Math.random().toString(36).slice(2, 10)}`;
      let next = gameAddCustomSpriteAsset(gameState, { id: assetId, url });
      const added = gameAddSprite(next, levelId, { behavior: null, assetId });
      // Stamp the assetId onto the sprite — addSprite's opts only carry
      // it as a hint, the sprite's `assetId` field is the SoT for the
      // runtime. updateSprite is the canonical mutator.
      next = gameUpdateSprite(added.state, levelId, added.sprite.id, { assetId });
      void prompt;
      setGameState(next);
      setGameSelection({ kind: "sprite", levelId, spriteId: added.sprite.id });
    },
    [gameState, activeLevelId],
  );

  const [activeSceneId, setActiveSceneId] = useState<string>(state.scenes[0].id);
  const [selection, setSelection] = useState<Selection>({
    kind: "scene",
    sceneId: state.scenes[0].id,
  });
  // Mirror the latest selection state into the history hook's sidecar
  // refs (#592). Done at render time, not in an effect, so the refs are
  // current before the next commit timer fires.
  selectionRef.current = selection;
  activeSceneIdRef.current = activeSceneId;
  setSelectionRef.current = setSelection;
  setActiveSceneIdRef.current = setActiveSceneId;
  // Live state mirror — lets the studio-editor bridge handle read the
  // current scene list at AI-tool-call time without re-registering on
  // every keystroke (the handle closes over this ref, not `state`).
  const stateRef = useRef(state);
  stateRef.current = state;
  const [zoom, setZoom] = useState<number>(0.56);
  const [saving, setSaving] = useState(false);
  const [advancedTimelineOpen, setAdvancedTimelineOpen] = useState(
    mountTimeDefaults.advancedTimelineOpen,
  );
  // Playtest toggle for `mediaKind: "game"` projects — flips
  // `<GameStage mode>` between "edit" (static layout, no game loop) and
  // "play" (runtime running, input wired). Self-gates inline (the
  // button only renders when `currentMediaKind === "game"`), no
  // per-kind prop drilling. Same Phaser-replacement runtime backs
  // both modes per the DRY commitment in PRD §1.2.
  const [gamePlaying, setGamePlaying] = useState(false);
  /** 3D-world invite dialog open state — lifted to the editor so the
   *  trigger button can live in the studio header (next to Save +
   *  Playtest) per the existing chrome pattern. The dialog is mounted
   *  once at this level; GameStage3D doesn't carry the affordance. */
  const [gameInviteOpen, setGameInviteOpen] = useState(false);
  // `?capture=` deep-links + audio-only template seeds both land the user
  // on the Actions tab so the recorder / voiceover panel is the first
  // thing they see. Single SoT via `deriveKindDefaults` (#651 + #894).
  const [leftTab, setLeftTab] = useState<LeftTabId>(mountTimeDefaults.leftTab);
  // Open action sheet (recorder / voiceover / captions / …), LIFTED here
  // from ActionsPanel so the Alt+Shift+R shortcut and the AI CHRO can
  // open the recorder at runtime — and so the sheet survives left-tab
  // switches (ActionsPanel unmounts when the user flips to Widgets).
  // Seeded once from the `?capture=` deep-link (mountTimeDefaults).
  const [openAction, setOpenAction] = useState<ActionId | null>(
    mountTimeDefaults.defaultAction ?? null,
  );
  // Whether the NEXT finished recording becomes its own full-bleed scene
  // (Alt+Shift+R / AI path → true) or an overlay widget on the active
  // scene (ActionsPanel recorder tiles → false). Reset to false whenever
  // an action is opened through the panel's own tiles.
  const [recordAsScene, setRecordAsScene] = useState(false);
  // Tracks whether the kind-aware post-load defaults have been applied
  // yet — flipped on first server-load to avoid clobbering manual
  // tab/timeline toggles on subsequent project refreshes.
  const kindDefaultsAppliedRef = useRef(false);
  // Whether the Widgets/Actions section (below the scenes rail) is
  // expanded. When collapsed it shrinks to a thin strip at the bottom
  // of the left panel so the scenes rail can use the full vertical
  // space. Persisted via localStorage so the user's choice survives
  // reload — same pattern as the CollapsiblePanel chrome.
  const [leftBottomOpen, setLeftBottomOpen] = useState<boolean>(() => {
    // Auto-arming an action (capture deep-link OR audio-only template
    // seed) needs the Actions section open so the user lands inside it.
    if (mountTimeDefaults.defaultAction) return true;
    if (typeof window === "undefined") return true;
    try {
      const raw = window.localStorage.getItem("studio.v2.left.bottom");
      return raw === "closed" ? false : true;
    } catch {
      return true;
    }
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        "studio.v2.left.bottom",
        leftBottomOpen ? "open" : "closed",
      );
    } catch {
      // ignore quota
    }
  }, [leftBottomOpen]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [docPreviewOpen, setDocPreviewOpen] = useState(false);
  const playback = usePreviewPlayback(state);
  // "Where has this project been published" (#1920) — one fetch shared by the
  // Save menu + Details drawer; refreshed after each successful publish.
  const { publications, refresh: refreshPublications } =
    usePublications(persistedProjectId);
  const [republishing, setRepublishing] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  const stageContainerRef = useRef<HTMLDivElement>(null);

  // Apply kind-aware defaults ONCE the server-loaded project arrives —
  // covers the case where the user opens a /studio/:id URL directly
  // (no templateHint at mount) for a podcast / voice project. The
  // mount-time defaults already handled the freshly-from-template case
  // via templateHint, so this effect only fires when the server's
  // `mediaKind` disagrees with the mount-time assumption. Guarded by a
  // ref so subsequent reloads / autosave round-trips don't clobber the
  // user's manual tab + timeline toggles.
  useEffect(() => {
    if (kindDefaultsAppliedRef.current) return;
    if (!persistedProject) return;
    kindDefaultsAppliedRef.current = true;
    const serverKind: MediaKind = persistedProject.mediaKind ?? "video";
    if (serverKind === mountTimeTemplateKind) return; // already applied
    const defaults = deriveKindDefaults(serverKind, urlCapture);
    setLeftTab(defaults.leftTab);
    setAdvancedTimelineOpen(defaults.advancedTimelineOpen);
    if (defaults.defaultAction) setLeftBottomOpen(true);
    // urlCapture is read-once on mount; mountTimeTemplateKind is also
    // mount-time only; both are stable for the effect's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistedProject]);

  // Per-kind runtime hydration — three previously-bespoke useEffect
  // blocks unified through `useKindHydration` (closes the studio-
  // audit DRY finding). Each hook call owns one runtime's lifecycle:
  //   - kind matches + not hydrated → seed (or read serverState)
  //   - kind doesn't match + was hydrated → unhydrate
  //   - kind matches + already hydrated → no-op (preserves edits)
  // Adding a new mediaKind = one more `useKindHydration` call here.
  useKindHydration<ImageState>({
    active: currentMediaKind === "image",
    hydrated: imageStateHydrated,
    serverState: persistedProject?.imageState as ImageState | null | undefined,
    seed: () => seedImageFromTemplate(templateHint),
    hydrate: (next) => {
      // `reset` (not `setState`) clears past/future stacks so undo
      // can't take the user below the just-loaded server state —
      // mirrors the Timeline runtime's resetHistory behavior.
      resetImageHistory(next);
      setImageStateHydrated(true);
    },
    unhydrate: () => setImageStateHydrated(false),
  });

  useKindHydration<AnimationState>({
    active: currentMediaKind === "animation",
    hydrated: animationStateHydrated,
    serverState: persistedProject?.animationState as AnimationState | null | undefined,
    seed: () => seedAnimationFromTemplate(templateHint),
    hydrate: (next) => {
      resetAnimationHistory(next);
      setAnimationStateHydrated(true);
    },
    unhydrate: () => setAnimationStateHydrated(false),
  });

  useKindHydration<CadState>({
    active: currentMediaKind === "cad",
    hydrated: cadStateHydrated,
    serverState: persistedProject?.cadState as CadState | null | undefined,
    seed: () => createBlankCadState(),
    hydrate: (next) => {
      resetCadHistory(next);
      setCadStateHydrated(true);
    },
    unhydrate: () => setCadStateHydrated(false),
  });

  // 3D CAD hydration (#930 Phase 2). The persisted column is `cad3dState`
  // (kebab → camel in the runtime payload), parsed once on first render
  // for cad_3d-kind projects.
  useKindHydration<Cad3DState>({
    active: currentMediaKind === "cad_3d",
    hydrated: cad3DStateHydrated,
    serverState: persistedProject?.cad3dState as Cad3DState | null | undefined,
    seed: () => createBlankCad3DState(),
    hydrate: (next) => {
      resetCad3DHistory(next);
      setCad3DStateHydrated(true);
    },
    unhydrate: () => setCad3DStateHydrated(false),
  });

  // Document hydration (#1912). Persisted column is `documentState`; seeded
  // as a blank resume document for a fresh draft. Same pattern as the other
  // non-Timeline runtimes.
  useKindHydration<DocumentState>({
    active: currentMediaKind === "document",
    hydrated: documentStateHydrated,
    serverState: persistedProject?.documentState as DocumentState | null | undefined,
    seed: () => createBlankDocumentState("resume", () => crypto.randomUUID()),
    hydrate: (next) => {
      resetDocumentHistory(next);
      setDocumentStateHydrated(true);
    },
    unhydrate: () => setDocumentStateHydrated(false),
  });

  // Document content fetch/seed (#1920). Once the document runtime hydrates,
  // load the bound resume's content (so section blocks render real data), or
  // seed a blank ResumeData for a fresh draft with no entity row yet.
  useEffect(() => {
    if (currentMediaKind !== "document" || !documentStateHydrated) return;
    let cancelled = false;
    (async () => {
      const entityId = documentState.entityId;
      if (entityId && documentState.entityKind === "resume") {
        try {
          const r = await resumeService.getResumeById(entityId);
          if (!cancelled) setDocumentEntityContent(mapContentToResumeData(r.content));
          return;
        } catch {
          // fall through to a blank doc if the resume can't be read
        }
      }
      if (!cancelled) setDocumentEntityContent((prev) => prev ?? getEmptyResumeData());
    })();
    return () => {
      cancelled = true;
    };
    // documentState.entityId is the binding signal; entityKind is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMediaKind, documentStateHydrated, documentState.entityId]);

  // Inline "upload existing résumé" success path (#1915 / #1935). The user is
  // already in the resume editor — the upload OVERWRITES the open résumé's
  // content in place (ResumeUpload `targetResumeId`), so `response.id` is the
  // same bound entity (a blank, unsaved draft has no entityId, so it falls back
  // to creating one). Either way we rebuild the canvas here: reuse the same
  // document-state builder as the ?editResume deep-link so the section blocks
  // are identical regardless of entry point, and set the parsed content
  // directly (the content effect above only refetches on an entityId CHANGE,
  // which an overwrite doesn't trigger).
  const handleResumeUploaded = useCallback(
    (response: ResumeUploadResponse) => {
      const content = response.content as unknown as Record<string, unknown>;
      const populated = Object.keys(content).filter(
        (k) => Array.isArray(content[k]) && (content[k] as unknown[]).length > 0,
      );
      const docState = createResumeDocumentState(
        response.id,
        populated,
        () => crypto.randomUUID(),
      );
      resetDocumentHistory(docState);
      setDocumentEntityContent(response.content);
      toast({ title: "Résumé imported", description: response.message });
    },
    [resetDocumentHistory, toast],
  );

  // Game uses the null-sentinel hydration pattern instead of a
  // separate boolean flag — `gameState !== null` IS the hydration
  // signal. No local `seed` because the first-save pipeline
  // (`seedGameFromTemplate` in `useCreateStudioDraft`) writes
  // gameState upstream before this hook fires; this hook waits.
  useKindHydration<import("@shared/game-state").GameState>({
    active: currentMediaKind === "game",
    hydrated: gameState !== null,
    serverState: persistedProject?.gameState as
      | import("@shared/game-state").GameState
      | null
      | undefined,
    // Self-heal a dangling startLevelId on load (legacy projects) so the
    // selection + dropdown resolve and a valid id persists on next save.
    hydrate: (next) => setGameState(gameNormalizeStartLevelId(next)),
    unhydrate: () => setGameState(null),
  });

  // Default the editor's selection to the project's startLevelId once
  // gameState hydrates — the user lands on the level the runtime would
  // mount on Playtest. Subsequent edits don't re-fire (selection stays
  // wherever the user puts it during the session).
  useEffect(() => {
    if (!gameState || gameSelection.kind !== "canvas") return;
    // Resolve through `findStartLevel` (find-by-id, fall back to
    // levels[0]) — NOT raw `startLevelId`, which can dangle (e.g. a seed
    // that overwrote levels[0] without updating startLevelId). Selecting
    // a non-existent level made GamePropertiesPanel reset to canvas
    // mid-render, re-firing this effect forever (infinite flash).
    const startId = findStartLevel(gameState)?.id;
    if (startId) setGameSelection({ kind: "level", levelId: startId });
  }, [gameState, gameSelection.kind]);

  // Server-load when we have a real project id.
  useEffect(() => {
    if (projectId === "new") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await studioService.getProject(projectId);
        if (cancelled) return;
        const project = res.data;
        if (!project) {
          // API returns 404 with no body for both "doesn't exist" and
          // "exists but you can't read it" — we can't distinguish and
          // shouldn't try (would leak existence). Drop the user into a
          // fresh empty editor with a sticky banner explaining why, and
          // null out the persisted id so their first save creates a new
          // project instead of attempting to PATCH the unreadable one.
          setMissingProject(true);
          setPersistedProjectId(null);
          return;
        }
        setMissingProject(false);
        setTitle(project.title);
        setPersistedProjectId(project.id);
        setPersistedProject(project);
        // Two legacy shapes feed this surface: (a) v2 projects with a
        // `timelineSpec` of canvas-v2:* clips, and (b) v1 projects with a
        // `script` (kind='scene' storyboard) and no timelineSpec — or a
        // timelineSpec that isn't v2-authored (the round-trip yields an
        // empty canvas because clipToWidget() bails on non-`canvas-v2:*`
        // effects). For (b) we hydrate from the script so scenes and
        // media land in the editor instead of silently dropping.
        const spec = project.timelineSpec;
        const hydratedFromTimeline = spec ? timelineToCanvasState(spec) : null;
        const timelineHasContent =
          hydratedFromTimeline?.scenes.some((s) => s.widgets.length > 0) ?? false;
        const hydrated = timelineHasContent
          ? hydratedFromTimeline!
          : project.script
            ? scriptToCanvasState(project.script)
            : hydratedFromTimeline;
        if (hydrated) {
          // Reset (not setState) so undo can't take the user below
          // the just-loaded server state — local-session history
          // against a different project's content would be confusing.
          resetHistory(hydrated);
          setActiveSceneId(hydrated.scenes[0].id);
          setSelection({ kind: "scene", sceneId: hydrated.scenes[0].id });
        }
      } catch (err) {
        if (cancelled) return;
        // NotFoundError on a project read = same UX as the null-body
        // case above (404 covers both missing + forbidden). Anything
        // else (network, schema mismatch) is worth surfacing loudly so
        // the user knows they're not just looking at a stale page.
        if (err instanceof NotFoundError) {
          setMissingProject(true);
          setPersistedProjectId(null);
          return;
        }
        toast({
          title: t("studio.editor.loadProjectFailed"),
          description: err instanceof Error ? err.message : t("errors.unknownError"),
          variant: "destructive",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, toast, resetHistory, t]);

  // Apply `?studioTemplate=<slug>` once on mount when present. The
  // marketplace's "Use this template" button (use-apply-template) emits
  // this URL for studio-creator kind; v1 already handles it via
  // StudioLayout. Mirror behaviour here so v2 users can clone creator
  // templates instead of dead-ending in an empty canvas (#630).
  useEffect(() => {
    if (!studioTemplateSlug || projectId !== "new") return;
    let cancelled = false;
    (async () => {
      try {
        const tpl = await studioTemplatesService.getBySlug(studioTemplateSlug);
        if (cancelled) return;
        const script = tpl.videoScript as VideoScript | null | undefined;
        if (!script) {
          toast({
            title: t("studio.editor.templateNoContentTitle"),
            description: t("studio.editor.templateNoContentDesc"),
            variant: "destructive",
          });
          return;
        }
        const hydrated = scriptToCanvasState(script);
        resetHistory(hydrated);
        setActiveSceneId(hydrated.scenes[0].id);
        setSelection({ kind: "scene", sceneId: hydrated.scenes[0].id });
        setTitle(tpl.name);
      } catch (err) {
        toast({
          title: t("studio.editor.loadTemplateFailed"),
          description: err instanceof Error ? err.message : t("errors.unknownError"),
          variant: "destructive",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studioTemplateSlug, projectId, toast, resetHistory, t]);

  // Local autosave so unsaved work survives reloads. The single effect
  // covers BOTH the Timeline-kind `state` (CanvasState) and the
  // image-kind `imageState` (#940 Phase 2 image autosave) — kind-aware
  // snapshot keeps storage shape unified so the hydration step at
  // `/studio/:id` knows which slice to rehydrate.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handle = window.setTimeout(() => {
      try {
        const snapshot: Record<string, unknown> = { title, state };
        if (currentMediaKind === "image") snapshot.imageState = imageState;
        window.localStorage.setItem(
          LOCAL_STORAGE_PREFIX + projectId,
          JSON.stringify(snapshot),
        );
      } catch {
        // Quota / private-mode — drop silently.
      }
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [projectId, title, state, imageState, currentMediaKind]);

  const fitZoom = useCallback(() => {
    const el = stageContainerRef.current;
    if (!el) return;
    const padding = 40;
    const availW = el.clientWidth - padding;
    const availH = el.clientHeight - padding;
    if (availW <= 0 || availH <= 0) return;
    const z = Math.min(availW / state.width, availH / state.height);
    setZoom(Math.max(0.1, Math.min(3, z)));
  }, [state.width, state.height]);

  // During playback, follow the playhead — switch the active scene when
  // the playhead crosses a scene boundary. We don't touch activeSceneId
  // when paused so manual scene clicks still win.
  useEffect(() => {
    if (!playback.isPlaying) return;
    if (!playback.activeSceneIdAtPlayhead) return;
    if (playback.activeSceneIdAtPlayhead === activeSceneId) return;
    setActiveSceneId(playback.activeSceneIdAtPlayhead);
  }, [playback.isPlaying, playback.activeSceneIdAtPlayhead, activeSceneId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    function onResize() {
      fitZoom();
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [fitZoom]);

  // #578 — refit zoom when the surrounding panels expand/collapse. We
  // only do it when the user has the canvas at the previously-fit zoom
  // value (within a 1 % tolerance) so a manually-tuned zoom doesn't get
  // clobbered by a panel toggle.
  const fittedZoomRef = useRef<number | null>(null);
  useEffect(() => {
    const el = stageContainerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let raf = 0;
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        const lastFit = fittedZoomRef.current;
        if (lastFit !== null && Math.abs(zoom - lastFit) > 0.01) return;
        const padding = 40;
        const availW = el.clientWidth - padding;
        const availH = el.clientHeight - padding;
        if (availW <= 0 || availH <= 0) return;
        const next = Math.max(
          0.1,
          Math.min(3, Math.min(availW / state.width, availH / state.height)),
        );
        fittedZoomRef.current = next;
        setZoom(next);
      });
    });
    observer.observe(el);
    return () => {
      window.cancelAnimationFrame(raf);
      observer.disconnect();
    };
    // We intentionally depend only on the canvas dimensions; the zoom
    // tolerance check above guards against clobbering manual zoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.width, state.height]);

  // ───── Mutators (single source of truth — every consumer goes through here)
  const activeScene = useMemo<Scene>(() => {
    return (
      state.scenes.find((s) => s.id === activeSceneId) ?? state.scenes[0]
    );
  }, [state, activeSceneId]);

  const updateScene = useCallback(
    (sceneId: string, patch: Partial<Scene>) => {
      setState((prev) => ({
        ...prev,
        scenes: prev.scenes.map((s) => (s.id === sceneId ? { ...s, ...patch } : s)),
      }));
    },
    [],
  );

  const addScene = useCallback((): string => {
    // Mint the scene OUTSIDE the updater so the id is stable under
    // strict-mode's double-invoke (mirrors duplicateScene) — the bridge
    // + AI tool need the returned id to reference the new scene.
    const next = emptyScene(`Scene ${stateRef.current.scenes.length + 1}`);
    setState((prev) => ({ ...prev, scenes: [...prev.scenes, next] }));
    return next.id;
  }, []);

  const deleteScene = useCallback(
    (sceneId: string) => {
      setState((prev) => {
        if (prev.scenes.length <= 1) return prev;
        const next = prev.scenes.filter((s) => s.id !== sceneId);
        return { ...prev, scenes: next };
      });
      setActiveSceneId((current) => {
        if (current !== sceneId) return current;
        const remaining = state.scenes.filter((s) => s.id !== sceneId);
        return remaining[0]?.id ?? current;
      });
      setSelection((current) => {
        if (current.kind === "widget" && current.sceneId === sceneId) {
          const remaining = state.scenes.filter((s) => s.id !== sceneId);
          return { kind: "scene", sceneId: remaining[0]?.id ?? sceneId };
        }
        if (current.kind === "scene" && current.sceneId === sceneId) {
          const remaining = state.scenes.filter((s) => s.id !== sceneId);
          return { kind: "scene", sceneId: remaining[0]?.id ?? sceneId };
        }
        return current;
      });
    },
    [state.scenes],
  );

  const duplicateScene = useCallback(
    (sceneId: string) => {
      // Clone OUTSIDE the setState updater so the new id is stable —
      // React calls updater functions twice under strict mode, which
      // would otherwise mint two different ids and leave the follow-up
      // setActiveSceneId pointing at the wrong one. Mirrors the
      // paste-scene flow in use-canvas-clipboard.ts (DRY).
      const source = state.scenes.find((s) => s.id === sceneId);
      if (!source) return;
      const next = cloneSceneWithNewIds(source);
      next.label = `${source.label} (copy)`;
      setState((prev) => {
        const idx = prev.scenes.findIndex((s) => s.id === sceneId);
        if (idx < 0) return prev;
        const scenes = [...prev.scenes];
        scenes.splice(idx + 1, 0, next);
        return { ...prev, scenes };
      });
      setActiveSceneId(next.id);
      setSelection({ kind: "scene", sceneId: next.id });
    },
    [state.scenes],
  );

  const reorderScenes = useCallback((nextOrderIds: string[]) => {
    setState((prev) => {
      const byId = new Map(prev.scenes.map((s) => [s.id, s]));
      return {
        ...prev,
        scenes: nextOrderIds
          .map((id) => byId.get(id))
          .filter((s): s is Scene => Boolean(s)),
      };
    });
  }, []);

  // Place a fully-built widget at an optional drop fraction, append it
  // to the active scene's widget list, and select it. Shared by every
  // "add a widget" pathway (palette click, drag-drop, linked-content
  // tile, media stamps) so anchor math + z-stack assignment + selection
  // live in one place.
  const placeWidget = useCallback(
    (widget: Widget, atFraction?: { x: number; y: number }) => {
      let placed = widget;
      if (atFraction) {
        placed = {
          ...widget,
          position: {
            ...widget.position,
            x: Math.max(
              0,
              Math.min(
                1 - widget.position.width,
                atFraction.x - widget.position.width / 2,
              ),
            ),
            y: Math.max(
              0,
              Math.min(
                1 - widget.position.height,
                atFraction.y - widget.position.height / 2,
              ),
            ),
          },
        };
      }
      setState((prev) => ({
        ...prev,
        scenes: prev.scenes.map((s) =>
          s.id === activeSceneId
            ? {
                ...s,
                widgets: [
                  ...s.widgets,
                  {
                    ...placed,
                    position: { ...placed.position, z: s.widgets.length + 1 },
                  },
                ],
              }
            : s,
        ),
      }));
      setSelection({ kind: "widget", sceneId: activeSceneId, widgetId: placed.id });
    },
    [activeSceneId],
  );

  const insertWidget = useCallback(
    (kind: WidgetKind, atFraction?: { x: number; y: number }) => {
      placeWidget(defaultWidget(kind), atFraction);
    },
    [placeWidget],
  );

  const insertLinkedContent = useCallback(
    (
      entityKind: LinkedContentKind,
      entityId: string,
      atFraction?: { x: number; y: number },
    ) => {
      // Pull the current theme / palette through `resolveLinkedContentColors`
      // so a card dropped onto a themed canvas adopts that theme's
      // chrome immediately — no per-template branching here, the
      // resolver is the single source of truth. Same colours are
      // re-stamped by `applyThemeToState` when the user later switches
      // themes, so the two paths can't drift.
      const colors = resolveLinkedContentColors(state);
      placeWidget(
        makeLinkedContentWidget({ entityKind, entityId, ...colors }),
        atFraction,
      );
    },
    [placeWidget, state],
  );

  const insertEngagementAsset = useCallback(
    (
      assetKind: EngagementAssetKind,
      assetId: string,
      atFraction?: { x: number; y: number },
    ) => {
      // Engagement assets adopt the same warm-card defaults as
      // linked-content (defined inside the widget factory) — no per-
      // theme stamping at insert time today since the per-kind body
      // renders its own chrome from the bound artifact. Theme-aware
      // stamping can layer in later via a `resolveEngagementAssetColors`
      // helper that mirrors `resolveLinkedContentColors`.
      placeWidget(makeEngagementAssetWidget({ assetKind, assetId }), atFraction);
    },
    [placeWidget],
  );

  const updateWidgetPosition = useCallback(
    (widgetId: string, position: WidgetPosition) => {
      setState((prev) => ({
        ...prev,
        scenes: prev.scenes.map((scene) => ({
          ...scene,
          widgets: scene.widgets.map((w) =>
            w.id === widgetId ? { ...w, position } : w,
          ),
        })),
      }));
    },
    [],
  );

  const updateWidgetParams = useCallback(
    (widgetId: string, params: WidgetParams) => {
      setState((prev) => ({
        ...prev,
        scenes: prev.scenes.map((scene) => ({
          ...scene,
          widgets: scene.widgets.map((w) =>
            w.id === widgetId ? { ...w, params } : w,
          ),
        })),
      }));
    },
    [],
  );

  const updateWidgetWindow = useCallback(
    (widgetId: string, visibleFrom: number | null, visibleTo: number | null) => {
      setState((prev) => ({
        ...prev,
        scenes: prev.scenes.map((scene) => ({
          ...scene,
          widgets: scene.widgets.map((w) =>
            w.id === widgetId ? { ...w, visibleFrom, visibleTo } : w,
          ),
        })),
      }));
    },
    [],
  );

  // Audio-timeline drag UI (#1115). One selection union for the
  // currently-active audio bar (music OR a specific voiceover); per-
  // source change handlers route through the shared mutator helpers in
  // canvas-state.ts. Commit fires on drag-end so a multi-tick drag
  // becomes one undo step.
  const [selectedAudio, setSelectedAudio] = useState<
    import("@/components/studio/v2/AdvancedTimeline").AudioSelection | null
  >(null);
  const handleVoiceoverChange = useCallback(
    (
      voiceoverId: string,
      patch: import("@/components/studio/v2/AdvancedTimeline").AudioPatch,
    ) => {
      setState((prev) => updateVoiceoverClip(prev, voiceoverId, patch));
    },
    [setState],
  );
  const handleMusicChange = useCallback(
    (patch: import("@/components/studio/v2/AdvancedTimeline").AudioPatch) => {
      setState((prev) => updateMusicTiming(prev, patch));
    },
    [setState],
  );
  const handleAudioCommit = useCallback(() => {
    // The history wrapper's `commit` records the current state as one
    // undo step. The drag emitted many setState calls during the drag;
    // they coalesced into the live state but didn't push a history
    // entry. Calling commit() at the end captures the final snapshot.
    commitHistory();
  }, [commitHistory]);

  // Generic widget patch mutator — used by inspector sections (e.g.
  // Motion, Timing) that mutate Widget-level fields outside of
  // `position` or `params`. Routing through one path keeps undo/redo
  // and autosave on the same wire as the more granular mutators.
  const updateWidget = useCallback(
    (widgetId: string, patch: Partial<Widget>) => {
      setState((prev) => ({
        ...prev,
        scenes: prev.scenes.map((scene) => ({
          ...scene,
          widgets: scene.widgets.map((w) =>
            w.id === widgetId ? { ...w, ...patch } : w,
          ),
        })),
      }));
    },
    [],
  );

  // Renumber widget z-indices on a scene from a front-to-back id list.
  // `widgetIdsFrontToBack[0]` ends up with the highest z (front-most);
  // the last id with z 0. Single seam for every "reorder layers" surface
  // (Layers panel today, future inspector "Bring forward"/"Send back"
  // buttons, future keyboard shortcuts) so undo/redo + autosave wrap
  // the change in one history step.
  const reorderLayers = useCallback(
    (sceneId: string, widgetIdsFrontToBack: string[]) => {
      setState((prev) => ({
        ...prev,
        scenes: prev.scenes.map((scene) => {
          if (scene.id !== sceneId) return scene;
          const total = widgetIdsFrontToBack.length;
          const zFor = (id: string) => {
            const idx = widgetIdsFrontToBack.indexOf(id);
            if (idx < 0) return 0;
            return total - 1 - idx;
          };
          return {
            ...scene,
            widgets: scene.widgets.map((w) => ({
              ...w,
              position: { ...w.position, z: zFor(w.id) },
            })),
          };
        }),
      }));
    },
    [],
  );

  // ───── Mutators surfaced to the Actions panel
  const addMediaWidget = useCallback(
    (
      kind: "image" | "video",
      url: string,
      durationSeconds = 0,
      atFraction?: { x: number; y: number },
    ) => {
      const widget = defaultWidget(kind);
      // Stamp the URL into the widget's content params. defaultWidget
      // gives a URL-backed source by default so we just rewrite the URL.
      if (widget.params.kind === "image") {
        widget.params.data.source = { kind: "url", url };
      } else if (widget.params.kind === "video") {
        widget.params.data.source = { kind: "url", url };
      }
      placeWidget(widget, atFraction);
      // Extend the scene duration if the new media exceeds the scene
      // length, so the user actually sees the clip play. Scene-duration
      // extension is media-specific, so it stays here rather than in
      // the shared `placeWidget` helper.
      if (durationSeconds > 0) {
        setState((prev) => ({
          ...prev,
          scenes: prev.scenes.map((s) =>
            s.id === activeSceneId && durationSeconds > s.durationSeconds
              ? { ...s, durationSeconds }
              : s,
          ),
        }));
      }
    },
    [activeSceneId, placeWidget],
  );

  // Single Control for the Screenshot palette tile + canvas screenshot
  // drop. Both surfaces call this; capture / upload lives in exactly
  // one hook (`useScreenshotCapture`) so there's no parallel pipeline.
  const { capture: captureScreenshot } = useScreenshotCapture();
  const placeScreenshot = useCallback(
    async (atFraction?: { x: number; y: number }) => {
      const handle = toast({
        title: t("studio.editor.capturingScreenshot"),
        description: t("studio.editor.capturingScreenshotDesc"),
      });
      const url = await captureScreenshot();
      handle.dismiss();
      if (!url) return;
      addMediaWidget("image", url, 0, atFraction);
    },
    [addMediaWidget, captureScreenshot, toast, t],
  );

  const setCaptionsState = useCallback((captions: CanvasState["captions"]) => {
    setState((prev) => ({ ...prev, captions }));
  }, []);

  const addVoiceoverClip = useCallback((clip: VoiceoverClip) => {
    setState((prev) => ({ ...prev, voiceovers: [...prev.voiceovers, clip] }));
  }, []);

  const setMusicFromBlob = useCallback(
    (blob: Blob, durationSeconds: number, label: string) => {
      // Original-music composer hands us a freshly-rendered WAV. We
      // register it as a custom MusicSource so resolveMusic() can hand
      // back a playable URL — same channel the stock picker uses (DRY).
      // R2 upload on save is gap-registered (#563); blob URL is fine
      // for the in-editor preview.
      const url = URL.createObjectURL(blob);
      setState((prev) => ({
        ...prev,
        musicSource: { kind: "custom", url, label, durationSeconds },
      }));
    },
    [],
  );

  // Derived source for the floating AI selection chip — resolves the
  // currently-selected element's image (per the active media kind) into
  // the props the shared `<AiSelectionChip/>` consumes. Returns null
  // when no usable source exists; the chip self-hides on null per the
  // shared-component visibility rule.
  //
  // Per-kind mapping (all routed through the SAME chip + the SAME
  // `useMediaAiPrompt` hook — DRY all the way down):
  //   • image      → active layer's pixelsDataUrl (img→img via dataUrl)
  //   • animation  → active frame's pixelsDataUrl (img→img via dataUrl)
  //   • game       → selected sprite's asset URL  (img→img via CDN url)
  //   • timeline   → selected image widget's URL  (img→img via CDN url)
  const aiChipSource = useMemo<{
    kindNoun: string;
    label?: string;
    url?: string;
    dataUrl?: string;
    placeholder?: string;
    /** Selection bbox in viewport pixels (design pixels × current zoom),
     *  relative to the per-surface `<div className="relative">` wrapper
     *  in which the chip mounts. Game sprites + timeline widgets supply
     *  one (chip anchors above the element); drawing layers + animation
     *  frames omit it (chip falls back to top-right of canvas — correct
     *  because the canvas IS the selection). */
    bbox?: { x: number; y: number; width: number; height: number };
    onGenerated: (result: ImageGenResult, prompt: string) => void | Promise<void>;
  } | null>(() => {
    if (currentMediaKind === "image") {
      const layer = findImageLayer(imageState, imageState.activeLayerId);
      if (!layer?.pixelsDataUrl) return null;
      return {
        kindNoun: "layer",
        label: layer.label,
        dataUrl: layer.pixelsDataUrl,
        placeholder: t("studio.editor.aiChipPlaceholderLayer"),
        onGenerated: (result, prompt) =>
          void handleImageAiGenerated(result, prompt, {
            replaceActiveLayer: true,
            hadTransparentIntent: false,
          }),
      };
    }
    if (currentMediaKind === "animation") {
      const frame = animationState.frames.find(
        (f) => f.id === animationState.activeFrameId,
      );
      if (!frame?.pixelsDataUrl) return null;
      return {
        kindNoun: "frame",
        label: t("studio.editor.frameLabel", {
          number: animationState.frames.indexOf(frame) + 1,
        }),
        dataUrl: frame.pixelsDataUrl,
        placeholder: t("studio.editor.aiChipPlaceholderFrame"),
        onGenerated: (result) => void handleAnimationAiGenerated(result),
      };
    }
    if (currentMediaKind === "game" && gameState && selectedSpriteId) {
      const level = gameState.levels.find((l) => l.id === activeLevelId);
      const sprite = level?.sprites.find((s) => s.id === selectedSpriteId);
      const asset = sprite
        ? gameState.assets.find((a) => a.id === sprite.assetId)
        : null;
      if (!asset?.url || !sprite) return null;
      return {
        kindNoun: "sprite",
        label: t("studio.editor.spriteLabel", { id: sprite.id }),
        url: asset.url,
        placeholder: t("studio.editor.aiChipPlaceholderSprite"),
        bbox: {
          x: sprite.x * zoom,
          y: sprite.y * zoom,
          width: sprite.width * zoom,
          height: sprite.height * zoom,
        },
        // In-place asset URL update — keeps the sprite's id, position,
        // size, behavior, scripts; only the bitmap changes. The chip
        // came from a selected sprite (img→img mode), so "update this
        // sprite" is the intuitive UX vs the right-rail panel's
        // "create a new sprite" path. `addCustomSpriteAsset` is
        // idempotent — re-adding the same id rewrites the URL.
        onGenerated: (result) => {
          const newUrl = result.resultUrl ?? result.previewUrl;
          setGameState((prev) =>
            prev ? gameAddCustomSpriteAsset(prev, { id: asset.id, url: newUrl }) : prev,
          );
        },
      };
    }
    if (usesTimelineChrome && selection.kind === "widget") {
      const widget = activeScene.widgets.find((w) => w.id === selection.widgetId);
      if (!widget || widget.params.kind !== "image") return null;
      const imageParams = widget.params;
      if (imageParams.data.source.kind !== "url") return null;
      const url = imageParams.data.source.url;
      if (!url) return null;
      return {
        kindNoun: "image",
        label: t("studio.editor.selectedImageLabel"),
        url,
        placeholder: t("studio.editor.aiChipPlaceholderImage"),
        // Timeline widgets store fractional position (0..1). Multiply
        // by canvas dims then by zoom to land in the canvas wrapper's
        // pixel coordinate space (the wrapper is sized `width × zoom`).
        bbox: {
          x: widget.position.x * state.width * zoom,
          y: widget.position.y * state.height * zoom,
          width: widget.position.width * state.width * zoom,
          height: widget.position.height * state.height * zoom,
        },
        onGenerated: (result) => {
          // Replace the image widget's source URL in place — keeps
          // the widget's position / window / motion / z-index, just
          // swaps the bitmap. Same SoT mutator the inspector uses.
          const newUrl = result.resultUrl ?? result.previewUrl;
          updateWidgetParams(widget.id, {
            ...imageParams,
            data: {
              ...imageParams.data,
              source: { kind: "url", url: newUrl },
            },
          });
        },
      };
    }
    return null;
  }, [
    currentMediaKind,
    imageState,
    animationState,
    gameState,
    selectedSpriteId,
    activeLevelId,
    usesTimelineChrome,
    selection,
    activeScene,
    state.width,
    state.height,
    zoom,
    handleImageAiGenerated,
    handleAnimationAiGenerated,
    handleGameAiGenerated,
    updateWidgetParams,
    t,
  ]);

  // Single chip ReactNode — composed once, mounted as a sibling inside
  // each per-kind canvas wrapper (via CanvasRouter's `surfaces` slots).
  // The chip self-gates on `aiChipSource` being non-null so each
  // surface mount can include `{aiChipNode}` unconditionally without a
  // per-kind canX check (per the shared-component visibility rule).
  const aiChipNode = aiChipSource ? (
    <AiSelectionChip
      alwaysVisible
      kindNoun={aiChipSource.kindNoun}
      selectionLabel={aiChipSource.label}
      sourceImageUrl={aiChipSource.url}
      sourceImageDataUrl={aiChipSource.dataUrl}
      placeholder={aiChipSource.placeholder}
      bbox={aiChipSource.bbox}
      onGenerated={aiChipSource.onGenerated}
    />
  ) : null;

  // V2-native audio mixer adapters (#645). Patch the canvas-level
  // audioMix slice + per-clip voiceover gain/muted. Defaults merge in
  // here so a freshly-created canvas (audioMix === null) still picks
  // up a usable shape on first touch.
  const patchAudioMix = useCallback(
    (patch: Partial<CanvasAudioMix>) => {
      setState((prev) => ({
        ...prev,
        audioMix: { ...(prev.audioMix ?? DEFAULT_AUDIO_MIX), ...patch },
      }));
    },
    [],
  );
  const patchVoiceoverClip = useCallback(
    (clipId: string, patch: Partial<Pick<VoiceoverClip, "gain" | "muted">>) => {
      setState((prev) => ({
        ...prev,
        voiceovers: prev.voiceovers.map((v) =>
          v.id === clipId ? { ...v, ...patch } : v,
        ),
      }));
    },
    [],
  );

  const updateWidgetText = useCallback(
    (widgetId: string, nextText: string) => {
      setState((prev) => ({
        ...prev,
        scenes: prev.scenes.map((scene) => ({
          ...scene,
          widgets: scene.widgets.map((w) => {
            if (w.id !== widgetId) return w;
            if (w.params.kind !== "text" && w.params.kind !== "heading") return w;
            return {
              ...w,
              params: {
                kind: w.params.kind,
                data: { ...w.params.data, text: nextText },
              },
            };
          }),
        })),
      }));
    },
    [],
  );

  const deleteWidget = useCallback((widgetId: string) => {
    setState((prev) => ({
      ...prev,
      scenes: prev.scenes.map((scene) => ({
        ...scene,
        widgets: scene.widgets.filter((w) => w.id !== widgetId),
      })),
    }));
    setSelection((current) =>
      current.kind === "widget" && current.widgetId === widgetId
        ? { kind: "scene", sceneId: activeSceneId }
        : current,
    );
  }, [activeSceneId]);

  // ───── Clipboard + keyboard shortcuts
  // Cut / copy / paste live in their own hook so the toolbar buttons
  // and the keyboard listener call the SAME action functions (DRY).
  // The clipboard targets whatever the user has selected — widget
  // when a widget is selected, the active scene otherwise — so a
  // single Ctrl+C / Ctrl+V loop covers both.
  const clipboard = useCanvasClipboard({
    state,
    selection,
    activeSceneId,
    setState,
    setActiveSceneId,
    setSelection,
  });
  // ───── Recorder runtime seams (Alt+Shift+R + AI CHRO)
  // What ActionsPanel calls from its OWN tiles + on close. Opening via a
  // tile is the legacy overlay path, so reset `recordAsScene`.
  const handleOpenActionChange = useCallback((next: ActionId | null) => {
    setOpenAction(next);
    setRecordAsScene(false);
  }, []);
  // Runtime entry used by the Alt+Shift+R shortcut AND the studio-editor
  // bridge: surface the Actions tab with the recorder armed to `mode`.
  // The finished clip becomes its own full-bleed scene by default
  // (slide → recording → slide); pass `asScene: false` for overlay.
  const openRecorder = useCallback(
    (mode: StudioRecordingMode, opts?: { asScene?: boolean }) => {
      setLeftTab("actions");
      setLeftBottomOpen(true);
      setRecordAsScene(opts?.asScene ?? true);
      setOpenAction(mode);
    },
    [],
  );
  // A finished recording becomes its OWN full-bleed scene, inserted right
  // after the active scene, duration matched to the clip. The renderer
  // already concatenates scenes sequentially, so save/publish stitches
  // slide → recording → slide with no special stitch path.
  const addRecordingScene = useCallback(
    (url: string, durationSeconds: number) => {
      const label =
        openAction === "webcam"
          ? "Webcam recording"
          : openAction === "screen-pip"
            ? "Screen + webcam"
            : "Screen recording";
      const scene = makeRecordingScene(label, url, durationSeconds);
      setState((prev) => {
        const idx = prev.scenes.findIndex(
          (s) => s.id === activeSceneIdRef.current,
        );
        const scenes = [...prev.scenes];
        scenes.splice(idx < 0 ? scenes.length : idx + 1, 0, scene);
        return { ...prev, scenes };
      });
      setActiveSceneId(scene.id);
      setSelection({ kind: "scene", sceneId: scene.id });
    },
    [openAction],
  );

  // Register this editor with the studio-editor bridge so the AI CHRO's
  // studio_* tools can drive it. Every method wraps the SAME callback the
  // on-screen control fires (DRY); the handle reads live scene state via
  // `stateRef`, so it never goes stale and never needs re-registering on
  // edits. Self-unregisters on unmount → tools fail loudly elsewhere.
  useEffect(() => {
    const handle: StudioEditorHandle = {
      projectId: persistedProjectId,
      mediaKind: currentMediaKind,
      getActiveSceneId: () => activeSceneIdRef.current,
      listScenes: () =>
        stateRef.current.scenes.map((s) => ({
          id: s.id,
          label: s.label,
          durationSeconds: s.durationSeconds,
          widgetCount: s.widgets.length,
          active: s.id === activeSceneIdRef.current,
        })),
      insertableWidgetKinds: () => insertableWidgetKindsFor(currentMediaKind),
      insertWidget: (kind) => insertWidget(kind),
      addScene: () => addScene(),
      duplicateScene: (sceneId) => duplicateScene(sceneId),
      deleteScene: (sceneId) => deleteScene(sceneId),
      reorderScenes: (orderedIds) => reorderScenes(orderedIds),
      setActiveScene: (sceneId) => {
        setActiveSceneId(sceneId);
        setSelection({ kind: "scene", sceneId });
      },
      setSceneBackground: (sceneId, color) =>
        updateScene(sceneId, { backgroundColor: color, backgroundEffect: null }),
      addImageWidget: (url) => addMediaWidget("image", url),
      addVideoWidget: (url, durationSeconds) =>
        addMediaWidget("video", url, durationSeconds),
      captureScreenshot: () => placeScreenshot(),
      openRecorder: (mode, opts) => openRecorder(mode, opts),
    };
    registerStudioEditor(handle);
    return () => unregisterStudioEditor(handle);
  }, [
    persistedProjectId,
    currentMediaKind,
    insertWidget,
    addScene,
    duplicateScene,
    deleteScene,
    reorderScenes,
    updateScene,
    addMediaWidget,
    placeScreenshot,
    openRecorder,
  ]);

  // Delete handler — uses the SAME mutators that the on-screen Delete
  // buttons fire (DRY) so keyboard + mouse paths can never diverge. We
  // refuse to drop the last remaining scene because the editor invariant
  // is "always one scene to draw on" (deleteScene already enforces this).
  const onDeleteSelection = useCallback(() => {
    if (selection.kind === "widget") {
      deleteWidget(selection.widgetId);
      return;
    }
    if (state.scenes.length > 1) deleteScene(selection.sceneId);
  }, [selection, deleteWidget, deleteScene, state.scenes.length]);
  useStudioShortcuts({
    onUndo: undo,
    onRedo: redo,
    onCopy: clipboard.copy,
    onCut: clipboard.cut,
    onPaste: clipboard.paste,
    onDelete: onDeleteSelection,
    // Alt+Shift+R → screen recorder as a new scene. "Screen record" is
    // the literal ask users keep typing into the AI chat; the recording
    // lands as its own full-bleed scene (slide → recording → slide).
    onOpenRecorder: () => openRecorder("screen", { asScene: true }),
  });

  // ───── Export — converts CanvasState → Timeline JSON → `renderTimeline()`
  // (the canvas-v2 effect registry is the single seam for compositing).
  // Closes the historical drift between the V2 player (DOM CanvasStage)
  // and the V2 export (used to translate through V1 scene-graph, which
  // dropped `linked-content` / `cta` widgets and re-laid-out text).
  // Now the export draws every widget through the same `canvas-v2:*`
  // appliers the editor preview will eventually share. Gap #828.
  const [exporting, setExporting] = useState(false);
  // In-memory blob of the most recent render — lets a "Publish" click
  // immediately after a successful export skip re-rendering. Cleared
  // whenever the canvas state mutates (the cached blob would be stale).
  const renderedBlobRef = useRef<Blob | null>(null);
  useEffect(() => {
    renderedBlobRef.current = null;
  }, [state]);
  const [linkedInPublishOpen, setLinkedInPublishOpen] = useState(false);
  // "Save as Course Lesson" — attaches the saved project to a course as
  // sourceType: studio_video. Closes the Studio→Course authoring loop
  // (parity with the Save menu's other publish destinations).
  const [attachToCourseOpen, setAttachToCourseOpen] = useState(false);
  // SuperAdmin page→video embed dialog (#1860).
  const [embedDialogOpen, setEmbedDialogOpen] = useState(false);

  async function renderToBlob(): Promise<Blob | null> {
    if (state.scenes.length === 0) return null;
    if (renderedBlobRef.current) return renderedBlobRef.current;
    const timeline = canvasStateToTimeline(state);
    const sources = await resolveTimelineAudioSources(state);
    const { renderTimeline } = await import("@/lib/timeline/render");
    // Branding-policy gate — same source of truth `<BrandWatermark/>`
    // reads on the DOM screen renderer (`shouldShowBranding({ isPro,
    // removeBrandingFlag })`). Threading the resolved boolean through
    // `renderTimeline` is what makes the encoded MP4 carry the SAME
    // pill the user sees in /studio + /v/<id>.
    const result = await renderTimeline(timeline, sources, {
      includeBranding: shouldShowBranding({
        isPro: subscription.isPro,
        removeBrandingFlag: removeBranding,
      }),
    });
    renderedBlobRef.current = result.blob;
    return result.blob;
  }

  // Wraps a render-driving callback (`handleExport`, `ensureRendered`,
  // etc.) so any throw surfaces a single shared error toast. The new
  // `renderTimeline()` path uses `OfflineAudioContext` for audio mixing
  // (not a live `AudioContext`), so the V1-era "audio device dropped
  // mid-render" recovery affordance no longer applies — the offline
  // mixer can't fail that way.
  async function withRenderErrorRecovery<T>(
    label: string,
    run: () => Promise<T>,
  ): Promise<T | null> {
    try {
      return await run();
    } catch (err) {
      toast({
        title: t("studio.editor.actionFailed", { action: label }),
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
      return null;
    }
  }

  /** Export the active project — single entry point. The per-kind
   *  dispatch lives in `exportProjectByKind` (closes the studio-audit
   *  finding that handleExport had three parallel early-return
   *  branches + a second per-kind switch in renderProjectToBlob).
   *  The host supplies the kind-specific callbacks the facade injects
   *  on demand (flattenImage for image kind, renderTimeline for the
   *  Timeline kinds). */
  async function handleExport() {
    // Document export is a browser print → Save as PDF of the read-only
    // DocumentView (#1912), not a Blob render — "preview === render === print".
    if (currentMediaKind === "document") {
      const ok = printDocument(documentState, documentEntityContent, title);
      if (!ok) {
        toast({
          title: "Couldn't open the print view",
          description: "Allow pop-ups for this site, then try Export again.",
          variant: "destructive",
        });
      }
      return;
    }
    setExporting(true);
    try {
      const blob = await exportProjectByKind({
        mediaKind: currentMediaKind,
        title,
        snapshot: {
          imageState,
          animationState,
          gameState,
          cadState,
          cad3dState: cad3DState,
          canvasState: state,
          flattenImage: imageCanvas
            ? async () => flattenCanvasToBlob(imageCanvas, "image/png")
            : undefined,
          renderTimeline: async () => {
            // Timeline kinds: route through the existing error-recovery
            // wrapper so the heavy render path keeps its toast UX.
            return withRenderErrorRecovery(t("actions.export"), async () => {
              if (state.scenes.length === 0) return null;
              return renderToBlob();
            });
          },
        },
      });
      if (!blob) {
        // Game without a seeded state surfaces a specific toast — the
        // user needs to pick a game template before export means
        // anything. Other null returns mean "nothing to export"
        // (empty timeline / no image canvas yet) and stay silent.
        if (currentMediaKind === "game" && !gameState) {
          toast({
            title: t("studio.editor.saveProjectFirstTitle"),
            description: t("studio.editor.saveProjectFirstGameDesc"),
            variant: "destructive",
          });
        }
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.replace(/\s+/g, "-").toLowerCase() || "project"}.${extensionForBlob(blob)}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: t("studio.editor.exportedTitle"), description: t("studio.editor.exportedDesc") });
    } catch (err) {
      toast({
        title: t("messages.exportFailedTitle"),
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  }

  // ───── ensureRendered — V2's parity for v1's `ensureRendered`. Used
  // by every publish destination: kicks off a render + upload when the
  // project doesn't already have a hosted videoUrl, so the user can
  // click "Publish to YouTube" / LinkedIn / Profile on a fresh draft
  // without a separate "Render first" detour. The Save step lands too,
  // so the upload has a project row to attach to. #653.
  async function ensureRendered(): Promise<StudioProject | null> {
    if (state.scenes.length === 0) {
      toast({
        title: t("studio.editor.addWidgetFirstTitle"),
        description: t("studio.editor.addWidgetFirstDesc"),
        variant: "destructive",
      });
      return null;
    }
    // Persist the draft up front so the upload has a project id to
    // attach to. `handleSave` returns the saved row so we don't have
    // to wait on async setState — the closure's `persistedProject`
    // would otherwise be stale on the first publish click of a new
    // project.
    let projectRow = persistedProject;
    if (!persistedProjectId) {
      projectRow = await handleSave();
      if (!projectRow) return null;
    }
    // Re-publish gate: skip the render only when the project's existing
    // baked MP4 is still in sync with the current timeline. The off-
    // platform Publish destinations (YouTube / LinkedIn / Profile /
    // Download) are the only callers that actually need a fresh MP4 —
    // in-platform viewing goes through <StudioPlayer/> which adapts to
    // unrendered projects via the live canvas path automatically.
    if (projectRow && isProjectBakedFresh(projectRow)) return projectRow;

    setExporting(true);
    const result = await withRenderErrorRecovery(t("studio.editor.renderLabel"), async () => {
      try {
        const blob = await renderToBlob();
        if (!blob) return null;
        const uploadRes = await studioService.uploadVideo(
          blob,
          title,
          projectRow?.id ?? persistedProjectId ?? undefined,
        );
        if (!uploadRes.data) throw new Error("Upload failed");
        projectRow = uploadRes.data;
        setPersistedProjectId(projectRow.id);
        setPersistedProject(projectRow);
        if (projectId === "new") {
          navigate(`/studio/${encodeURIComponent(projectRow.id)}`, { replace: true });
        }
        // Stamp the timelineSpec with the hash that produced this render
        // so freshness checks elsewhere (project tiles, the upcoming
        // "Unpublished edits" badge) can tell when the user has edited
        // beyond what's live. Re-save with the stamped spec; the
        // returned row carries the stamped timelineSpec back.
        const stampedTimeline = withBakedTimelineHash(
          canvasStateToTimeline(state),
          computeTimelineSpecHash(canvasStateToTimeline(state)),
        );
        try {
          const stampedRes = await studioService.saveDraft({
            name: title,
            projectId: projectRow.id,
            kind: "nle",
            timelineSpec: stampedTimeline,
          });
          if (stampedRes.data) {
            projectRow = stampedRes.data;
            setPersistedProject(stampedRes.data);
          }
        } catch {
          // Non-fatal — the render + upload still succeeded; only the
          // freshness stamp didn't land. Will retry on the next save.
        }
        return projectRow;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // QUOTA_EXCEEDED isn't an audio error; re-throw with friendly
        // copy so the shared recovery wrapper toasts it under "Render
        // failed" instead of pretending it's a device issue.
        if (/QUOTA_EXCEEDED/i.test(msg)) {
          throw new Error(t("studio.editor.publishQuotaExceeded"));
        }
        throw err;
      }
    });
    setExporting(false);
    return result ?? null;
  }

  // A "View" toast action that opens the published URL. Absolute links
  // (YouTube / LinkedIn) open in a new tab; the on-platform /v/ link opens
  // in-app. Returns undefined for an empty URL so the toast omits the action.
  function viewAction(url: string | null | undefined) {
    if (!url) return undefined;
    return (
      <ToastAction
        altText="View where it was published"
        onClick={() => window.open(url, url.startsWith("http") ? "_blank" : "_self")}
      >
        View
      </ToastAction>
    );
  }

  async function handlePublishToYouTube() {
    const project = await ensureRendered();
    if (!project) return;
    setRepublishing("youtube");
    try {
      // Real upload to the user's connected YouTube channel (#1920). The
      // server pulls the rendered MP4, uploads via the Data API, persists
      // the watch URL, and records the publication — so re-publishing the
      // same project updates the same record (one row per destination).
      const res = await studioService.publishToYouTube(project.id, {
        title,
        description: "",
        privacyStatus: project.isPublic ? "public" : "unlisted",
      });
      const url = res.data?.youtubeUrl;
      await refreshPublications();
      toast({
        title: t("messages.publishedYouTubeTitle"),
        description: url ? "Your video is live on YouTube." : t("studio.editor.videoLiveDesc"),
        action: viewAction(url),
      });
    } catch (err) {
      const code = serverCodeOf(err);
      if (code === "YOUTUBE_NOT_CONNECTED") {
        // Distinct, actionable path: send the user to Settings to link a
        // channel rather than a generic "publish failed".
        toast({
          title: "Connect YouTube first",
          description: "Link your YouTube channel in Settings, then publish.",
          action: (
            <ToastAction altText="Open settings" onClick={() => navigate("/settings")}>
              Settings
            </ToastAction>
          ),
        });
      } else {
        toast({
          title: t("messages.publishFailedTitle"),
          description: err instanceof Error ? err.message : t("errors.unknownError"),
          variant: "destructive",
        });
      }
    } finally {
      setRepublishing(null);
    }
  }

  async function handlePublishToProfile() {
    const isOnProfile = persistedProject?.status === "Published";
    // Publish-to-Profile is on-platform — the universal <StudioPlayer/>
    // hydrates from `timelineSpec` / `script` JSON and plays live, so
    // no MP4 render is required. Only off-platform destinations
    // (YouTube / LinkedIn / Download) gate on `ensureRendered()`. All
    // we need here is a persisted project id so PATCH /status has
    // something to flip; `handleSave()` is enough for that.
    let targetId = persistedProjectId;
    if (!targetId) {
      const saved = await handleSave();
      if (!saved) return;
      targetId = saved.id;
    }
    if (!targetId) return;
    const nextStatus = isOnProfile ? "exported" : "published";
    try {
      const res = await studioService.updateProjectStatus(
        targetId,
        nextStatus,
      );
      if (res.data) {
        setPersistedProject(res.data);
        // Server records / clears the "profile" publication on this status
        // flip; reflect it in the shared list.
        await refreshPublications();
        const profileUrl = !isOnProfile
          ? `/v/${res.data.slug || targetId}`
          : null;
        toast({
          title: isOnProfile
            ? t("studio.editor.removedFromProfileTitle")
            : t("messages.publishedProfileTitle"),
          description: isOnProfile
            ? t("studio.editor.removedFromProfileDesc")
            : t("studio.editor.publishedProfileDesc"),
          action: viewAction(profileUrl),
        });
      }
    } catch (err) {
      toast({
        title: isOnProfile ? t("studio.editor.removeFailed") : t("messages.publishFailedTitle"),
        description: err instanceof Error ? err.message : t("errors.unknownError"),
        variant: "destructive",
      });
    }
  }

  async function handlePublishToLinkedIn() {
    const project = await ensureRendered();
    if (!project) return;
    setLinkedInPublishOpen(true);
  }

  // Re-publish a destination from the "Published to" list. Maps the
  // destination id back to its publish handler (the same ones the Save
  // menu's publish rows fire), so the list reuses the canonical flow rather
  // than a parallel path. Unknown / unsupported destinations no-op.
  function handleRepublish(destination: string) {
    switch (destination) {
      case "youtube":
        void handlePublishToYouTube();
        break;
      case "linkedin":
        void handlePublishToLinkedIn();
        break;
      case "profile":
        // Profile re-publish is a no-op when already live; the handler
        // toggles, so only fire it when the project isn't currently on the
        // profile (otherwise it would UN-publish).
        if (persistedProject?.status !== "Published") void handlePublishToProfile();
        break;
      default:
        break;
    }
  }

  // ───── Save / publish
  // Returns the persisted StudioProject so callers (notably
  // `ensureRendered`) can chain a follow-up upload without re-reading
  // through the async-state setters. Resolves to null on failure.
  async function handleSave(): Promise<StudioProject | null> {
    setSaving(true);
    try {
      // Per the canvas-runtime extensibility model (#931 / PRD §1.2)
      // each runtime persists its OWN state column — Timeline kinds
      // (video / podcast / voice / animation / comic) write
      // `timelineSpec`; image kind writes `imageState`; game kind
      // writes `gameState`. The save-draft payload carries whichever
      // is relevant; the server's editor-kind discriminator picks
      // which JSONB column to update.
      // Per-kind runtime-state slice — single SoT in
      // `runtimeStatePayload`. The branch lives ONCE (per the DRY
      // rule); adding a new mediaKind is one more case there, not a
      // new spread here. #637 closed: V2 no longer mirrors a v1
      // VideoScript projection onto the project row — the slice's
      // `kind` discriminator + the runtime-specific state column is
      // the canonical representation.
      // R2 spill: for image kind, promote any layer whose flattened
      // PNG exceeds LAYER_DATAURL_SPILL_BYTES to R2 BEFORE persisting
      // (#940 brush dataURL bloat mitigation). The helper is a no-op
      // when nothing needs spilling.
      let imageStateToPersist = imageState;
      if (currentMediaKind === "image") {
        const spilledLayers = await spillLayersIfNeeded(imageState.layers);
        if (spilledLayers !== imageState.layers) {
          imageStateToPersist = { ...imageState, layers: spilledLayers };
          setImageState(imageStateToPersist);
        }
      }
      // Document content persistence (#1916/#1920): a document's CONTENT
      // lives in its entity row (the resume), NOT in DocumentState. On save,
      // write the edited content to the resume — creating the row on first
      // save — and stamp its id onto DocumentState so reads re-bind. The
      // DocumentState (layout/structure) itself persists via the slice below.
      // Document content persistence (#1916/#1920/#1914) — entity-aware. The
      // DocumentState (layout) persists via the slice below regardless; here we
      // sync the document's CONTENT into its entity row so the document also
      // exists in that entity's system (resume / articles).
      let documentStateForSave = documentState;
      if (currentMediaKind === "document") {
        try {
          if (documentState.entityKind === "resume" && documentEntityContent) {
            // Resume: content lives in `resume_information`. Snapshot the canvas
            // LAYOUT onto `content.meta.documentLayout` (ResumeMetaSchema is
            // `.catchall`) so /resumes/:id renders it via <DocumentView>.
            const contentForSave = {
              ...documentEntityContent,
              meta: {
                ...((documentEntityContent.meta ?? {}) as Record<string, unknown>),
                documentLayout: documentState,
              },
            } as ResumeData;
            if (documentState.entityId) {
              await resumeService.updateResumeData(documentState.entityId, {
                data: contentForSave,
              });
            } else {
              const createdResume = await resumeService.createResume({
                title,
                data: contentForSave,
                isMaster: true,
                isActive: true,
              });
              documentStateForSave = { ...documentState, entityId: createdResume.id };
              setDocumentState(() => documentStateForSave);
            }
          } else if (
            documentState.entityKind === "article" ||
            documentState.entityKind === "blog"
          ) {
            // Article / blog (#1914): the canvas blocks are the source; derive a
            // title + markdown body and upsert an `articles` row so the
            // document enters the articles system (draft).
            const { title: derivedTitle, bodyMd } = documentToArticle(documentState);
            const articleTitle = derivedTitle || title;
            if (documentState.entityId) {
              await articleService.update(documentState.entityId, {
                title: articleTitle,
                bodyMd,
              });
            } else {
              const createdArticle = await articleService.create({
                title: articleTitle,
                bodyMd,
                kind: "article",
              });
              documentStateForSave = { ...documentState, entityId: createdArticle.id };
              setDocumentState(() => documentStateForSave);
            }
          }
        } catch (err) {
          toast({
            title: t("errors.saveFailed"),
            description: err instanceof Error ? err.message : t("errors.unknownError"),
            variant: "destructive",
          });
        }
      }
      const runtimeSlice = runtimeStatePayload(currentMediaKind, {
        canvasState: state,
        imageState: imageStateToPersist,
        animationState,
        gameState,
        cadState,
        cad3dState: cad3DState,
        documentState: documentStateForSave,
      });
      const res = await studioService.saveDraft({
        name: title,
        projectId: persistedProjectId ?? undefined,
        mediaKind: currentMediaKind,
        ...runtimeSlice,
        // First save of a `/studio/new?subject=...` deep-link binds the
        // freshly-created project row to the source entity. Subsequent
        // saves (persistedProjectId set) leave the subjects array alone
        // — the chips in the header are the canonical edit surface.
        ...(persistedProjectId === null && urlSubject
          ? { subjects: [urlSubject] }
          : {}),
      });
      if (res.data?.id) {
        setPersistedProjectId(res.data.id);
        setPersistedProject(res.data);
        // Sync the URL when the route was either `/new` or pointed at an
        // unreadable id the load step recovered from (`missingProject`).
        // In both cases the save just minted a brand-new project row, so
        // the URL has to follow or the next reload would re-trigger the
        // not-found banner against a stale id.
        if (projectId !== res.data.id) {
          navigate(`/studio/${encodeURIComponent(res.data.id)}`, { replace: true });
        }
        setMissingProject(false);
      }
      toast({ title: t("messages.savedTitle") });
      return res.data ?? null;
    } catch (err) {
      toast({
        title: t("errors.saveFailed"),
        description: err instanceof Error ? err.message : t("errors.unknownError"),
        variant: "destructive",
      });
      return null;
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) {
    return <StudioLoadingShell />;
  }

  if (!user) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg font-medium">{t("studio.editor.signInPrompt")}</p>
        <Button onClick={() => navigate("/login")}>{t("actions.signIn")}</Button>
      </div>
    );
  }

  // Project-ready gate — closes the "wrong-chrome flash" bug where
  // opening an existing image/game/animation project via direct URL
  // mounted the video chrome first (because `currentMediaKind` falls
  // back to `mountTimeTemplateKind` = "video" before `persistedProject`
  // arrives), then repainted the left/right rails into the correct
  // kind 300–800 ms later. The gate has two parts:
  //   • `projectId === "new"` short-circuits — the URL's
  //     `?contentTemplate=` already gave us the right kind synchronously
  //     so there's no wait, no flash.
  //   • For existing projects we wait until either `persistedProject`
  //     loads OR the load failed (`missingProject` — surfaces the empty
  //     editor with a "doesn't exist" banner instead of looping
  //     forever).
  // `runtimeHydrated` waits the additional tick that per-kind
  // runtimes need to seed (image / animation / game canvases mount
  // null until their state hydrates). Timeline kinds always return
  // true because `state` is seeded synchronously by useState.
  const runtimeHydrated =
    currentMediaKind === "image"
      ? imageStateHydrated
      : currentMediaKind === "animation"
        ? animationStateHydrated
        : currentMediaKind === "game"
          ? gameState !== null
          : true;
  const projectReady =
    (projectId === "new" || persistedProject !== null || missingProject) &&
    runtimeHydrated;
  if (!projectReady) {
    return <StudioLoadingShell />;
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onCollapse={() => setSidebarCollapsed((c) => !c)}
        collapsed={sidebarCollapsed}
      />
      <div
        className={cn(
          // pt-16 reserves space for the app-wide <Navigation/>, which is
          // `position: fixed top-0 z-50`. Without it the EditorHeader below
          // would render behind the global nav and the user wouldn't see
          // the back/save/preview/share controls.
          // min-h-0 lets descendants (left/right panels + canvas) constrain
          // to the viewport so their overflow:auto scrolls internally
          // instead of growing the page and scrolling the document.
          "flex min-h-0 flex-1 flex-col pt-16 transition-all duration-300",
          sidebarCollapsed ? "lg:ml-16" : "lg:ml-80",
        )}
      >
        <Navigation
          onMenuClick={() => setSidebarOpen(true)}
          onSidebarToggle={() => setSidebarCollapsed((c) => !c)}
          sidebarCollapsed={sidebarCollapsed}
        />
        <EditorHeader
          title={title}
          onTitleChange={setTitle}
          onBack={() => navigate("/studio")}
          onSave={handleSave}
          saving={saving}
          playback={playback}
          onApplyLayoutBindings={(bindings) => {
            if (bindings.leftTab === "widgets" || bindings.leftTab === "actions") {
              setLeftTab(bindings.leftTab);
            }
            setAdvancedTimelineOpen(bindings.advancedTimelineOpen);
          }}
          persistedProjectId={persistedProjectId}
          persistedProject={persistedProject}
          onProjectChange={setPersistedProject}
          getVideoScript={() => canvasStateToScript(state)}
          hasContent={
            // Per-kind content predicate — Timeline kinds need at
            // least one widget on a scene; game kinds need a
            // gameState with levels; image kind always has content
            // (the canvas itself is a flattenable artefact even if no
            // strokes have landed — the background fill IS valid
            // output). Reads local kind-state (not `persistedProject.*`)
            // so an in-editor change immediately enables the Export
            // button without waiting for a save round-trip.
            currentMediaKind === "game"
              ? !!gameState && gameState.levels.length > 0
              : currentMediaKind === "image"
                ? true
                : state.scenes.some((s) => s.widgets.length > 0)
          }
          onOpenPreview={() => setPreviewOpen(true)}
          onOpenDocumentPreview={
            currentMediaKind === "document" ? () => setDocPreviewOpen(true) : undefined
          }
          mediaKind={currentMediaKind}
          gameEngine={gameState?.engine ?? null}
          gamePlaying={gamePlaying}
          onTogglePlaytest={() => setGamePlaying((p) => !p)}
          animationPlaying={animationPlaying}
          onToggleAnimationPlay={() => setAnimationPlaying((p) => !p)}
          onOpenInvite={() => setGameInviteOpen(true)}
          onExportRoblox={
            gameState && gameState.engine === "world-3d"
              ? () => downloadRobloxFile(gameState, `${title || "hired-world"}.rbxlx`)
              : undefined
          }
          onExport={handleExport}
          exporting={exporting}
          onPublishToYouTube={handlePublishToYouTube}
          onPublishToLinkedIn={handlePublishToLinkedIn}
          onPublishToProfile={handlePublishToProfile}
          onSaveImageToLibrary={
            currentMediaKind === "image" && !savingImageToLibrary && !!imageCanvas
              ? handleSaveImageToLibrary
              : undefined
          }
          onPublishAsCourseLesson={
            persistedProjectId ? () => setAttachToCourseOpen(true) : undefined
          }
          onEmbedOnPage={
            persistedProjectId && isSuperAdminFromToken()
              ? () => setEmbedDialogOpen(true)
              : undefined
          }
          usesTimelineChrome={usesTimelineChrome}
          publications={publications}
          onRepublish={handleRepublish}
          republishing={republishing}
          onPublicationsChange={refreshPublications}
        />
        {missingProject && (
          <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
            <p className="font-medium">{t("studio.editor.missingProjectTitle")}</p>
            <p className="mt-0.5 text-xs opacity-80">
              {t("studio.editor.missingProjectDesc")}
            </p>
          </div>
        )}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* LEFT — scenes (top) + tabbed Add / Design panel (bottom). The
              bottom panel hosts the widget palette and the shared theme /
              background / music pickers behind tabs so the v2 user has
              parity with v1's sidebar sections. Collapsible via the shared
              CollapsiblePanel (own state, persists to localStorage). */}
          {/* Left panel — kind-aware mount per the V2-Video reference
              pattern. Same `<CollapsiblePanel side="left">` shell every
              kind uses; CONTENTS swap by mediaKind so the editor's
              padding / collapse / borders stay uniform across every
              kind (per DRY: one shell, kind-aware contents).
                • Timeline kinds → Scenes rail + Widget / Media /
                  Actions tabs.
                • Image kind → `<DrawingToolPalette/>` (brush / eraser /
                  fill / eyedropper + size / opacity / hardness sliders
                  + color picker + recent-colors row).
                • Game kind → `<LevelsRail/>` on top + `<SpritePalette/>`
                  on bottom (same composition as Video's
                  ScenesRail+WidgetPalette, just with game data). */}
          {currentMediaKind === "image" && (
            <CollapsiblePanel
              side="left"
              label={t("studio.editor.panelTools")}
              storageKey="studio.v2.panel.left"
              expandedClassName="w-56"
            >
              <DrawingToolPalette
                tool={imageTool}
                onToolChange={setImageTool}
                brush={imageBrush}
                onBrushChange={setImageBrush}
                recentColors={imageRecentColors}
              />
            </CollapsiblePanel>
          )}
          {/* Game-kind left panel — mirrors the Video shell's
              "ScenesRail on top, WidgetPalette on bottom" composition
              but with game-shaped contents: LevelsRail + SpritePalette.
              Same `<CollapsiblePanel side="left">` chrome so users get
              an identical layout across kinds, just different
              authoring primitives inside. */}
          {currentMediaKind === "game" && gameState && (
            <CollapsiblePanel
              side="left"
              label={t("studio.editor.panelLevels")}
              storageKey="studio.v2.panel.left"
              expandedClassName="w-64"
            >
              <div className="min-h-0 flex-1 border-b border-border">
                <LevelsRail
                  gameState={gameState}
                  onChange={setGameState}
                  activeLevelId={activeLevelId}
                  onSelect={(levelId) => setGameSelection({ kind: "level", levelId })}
                />
              </div>
              <div className="flex h-[55%] min-h-[200px] flex-col bg-card">
                {/* 3D-world projects get a primitive-shapes section
                    ABOVE the regular sprite library — both panels
                    are usable. The 3D primitives drag in as untextured
                    blocks/platforms/ramps; the sprite library entries
                    drag in as textured entities (sprite art mapped to
                    a block face) + give access to the MediaPicker
                    "Custom upload" affordance at the bottom — same
                    way the 2D editor exposes user-uploaded assets.
                    DRY: both engines share the SpritePalette section. */}
                {gameState?.engine === "world-3d" && (
                  <>
                    <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("studio.editor.sectionPieces")}
                    </div>
                    <div className="max-h-[40%] min-h-0 overflow-y-auto border-b border-border">
                      <EntityPaletteLeft />
                    </div>
                  </>
                )}
                <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {gameState?.engine === "world-3d"
                    ? t("studio.editor.sectionSpritesAssets")
                    : t("studio.editor.sectionSprites")}
                </div>
                <div className="min-h-0 flex-1">
                  <SpritePalette
                    gameState={gameState}
                    onChange={setGameState}
                    activeLevelId={activeLevelId}
                    onSelectSprite={(spriteId) => {
                      if (spriteId && activeLevelId) {
                        setGameSelection({ kind: "sprite", levelId: activeLevelId, spriteId });
                      }
                    }}
                  />
                </div>
              </div>
            </CollapsiblePanel>
          )}
          {/* Animation-kind left panel — Frames rail (top) + drawing tool
              palette (bottom). Same `<CollapsiblePanel side="left">`
              shell + the same "navigator on top, palette on bottom"
              composition Game uses (LevelsRail + SpritePalette) and Video
              uses (ScenesRail + WidgetPalette). Frames are the animation
              analogue of scenes/levels, so they belong HERE — not at the
              bottom of the canvas where they used to live. The tool
              palette is the SAME `<DrawingToolPalette>` the image kind
              uses, so animation finally has the brush / eraser / fill /
              eyedropper + size / opacity / colour controls it was
              missing (it shares `imageTool` / `imageBrush` state with the
              stage). */}
          {currentMediaKind === "animation" && (
            <CollapsiblePanel
              side="left"
              label={t("studio.editor.panelFrames")}
              storageKey="studio.v2.panel.left"
              expandedClassName="w-64"
            >
              <div className="min-h-0 flex-1 border-b border-border">
                <FramesRail
                  state={animationState}
                  onChange={commitAnimationState}
                  onSelect={selectAnimationFrame}
                />
              </div>
              <div className="flex h-[55%] min-h-[200px] flex-col bg-card">
                <DrawingToolPalette
                  tool={imageTool}
                  onToolChange={setImageTool}
                  brush={imageBrush}
                  onBrushChange={setImageBrush}
                  recentColors={imageRecentColors}
                />
              </div>
            </CollapsiblePanel>
          )}
          {/* Document kind — left rail hosts templates + the draggable
              section palette + page setup (replaces the on-canvas toolbar). */}
          {currentMediaKind === "document" && documentStateHydrated && (
            <CollapsiblePanel
              side="left"
              label={t("studio.editor.panelTools")}
              storageKey="studio.v2.panel.left"
              expandedClassName="w-64"
            >
              <DocumentLeftPanel
                state={documentState}
                setState={setDocumentState}
                commit={documentCommit}
              />
            </CollapsiblePanel>
          )}
          {usesTimelineChrome && (
          <CollapsiblePanel
            side="left"
            label={t("studio.editor.panelScenes")}
            storageKey="studio.v2.panel.left"
            expandedClassName="w-64"
          >
            {/* Scenes rail grows to fill remaining space; widgets/actions
                section collapses to a thin strip at the bottom on demand
                so the user can give scenes the full vertical column. */}
            <div className="min-h-0 flex-1 border-b border-border">
              <ScenesRail
                scenes={state.scenes}
                activeSceneId={activeSceneId}
                onSelect={(id) => {
                  setActiveSceneId(id);
                  setSelection({ kind: "scene", sceneId: id });
                }}
                onAdd={addScene}
                onDelete={deleteScene}
                onDuplicate={duplicateScene}
                onReorder={reorderScenes}
              />
            </div>
            <div
              className={cn(
                "flex flex-col bg-card",
                leftBottomOpen ? "h-[55%] min-h-[200px]" : "shrink-0",
              )}
            >
              <LeftTabs
                tab={leftTab}
                onChange={setLeftTab}
                expanded={leftBottomOpen}
                onToggle={() => setLeftBottomOpen((open) => !open)}
              />
              {leftBottomOpen && (
                <div className="min-h-0 flex-1 overflow-hidden">
                  {leftTab === "widgets" && (
                    <WidgetPalette
                      onInsert={(kind) => insertWidget(kind)}
                      onInsertLinkedContent={(entityKind, entityId) =>
                        insertLinkedContent(entityKind, entityId)
                      }
                      onCaptureScreenshot={() => placeScreenshot()}
                      onAddImageWidget={(url) => addMediaWidget("image", url)}
                      onAddVideoWidget={(url, durationSeconds) =>
                        addMediaWidget("video", url, durationSeconds)
                      }
                      onAddVoiceover={addVoiceoverClip}
                      activeSceneId={activeSceneId}
                      mediaKind={currentMediaKind}
                    />
                  )}
                  {leftTab === "actions" && (
                    <ActionsPanel
                      openAction={openAction}
                      onOpenActionChange={handleOpenActionChange}
                      recordAsScene={recordAsScene}
                      onAddRecordingScene={addRecordingScene}
                      currentTimeSec={playback.playhead}
                      state={state}
                      activeScene={activeScene}
                      selectedWidget={
                        selection.kind === "widget"
                          ? activeScene.widgets.find(
                              (w) => w.id === selection.widgetId,
                            ) ?? null
                          : null
                      }
                      persistedProjectId={persistedProjectId}
                      videoId={persistedProject?.youtubeVideoId ?? persistedProject?.id ?? null}
                      onInsertWidget={insertWidget}
                      onCaptureScreenshot={() => placeScreenshot()}
                      onAddVideoWidget={(url, durationSeconds) =>
                        addMediaWidget("video", url, durationSeconds)
                      }
                      onAddImageWidget={(url) => addMediaWidget("image", url)}
                      onAddVoiceover={addVoiceoverClip}
                      onSetCaptions={setCaptionsState}
                      onSetMusicFromBlob={setMusicFromBlob}
                      onUpdateWidgetText={updateWidgetText}
                      onRestoreCanvas={(next) => {
                        // Reset the history so undo can't take the user
                        // below the restored version (matches the
                        // load-from-server bootstrap pattern).
                        resetHistory(next);
                        setActiveSceneId(next.scenes[0]?.id ?? activeSceneId);
                      }}
                      onPatchAudioMix={patchAudioMix}
                      onPatchVoiceover={patchVoiceoverClip}
                      onInsertEngagementAsset={insertEngagementAsset}
                    />
                  )}
                </div>
              )}
            </div>
          </CollapsiblePanel>
          )}

          {/* CENTER — canvas + timeline. `min-w-0` is critical: without it
              flex children default to `min-width: auto`, which lets the
              canvas push the side panels out of the viewport when the user
              zooms past fit. With `min-w-0` the column stays bounded and
              the inner overflow-auto wrapper scrolls instead. */}
          <section className="flex min-w-0 flex-1 flex-col bg-muted/30">
            {/* Subject deep-link banner — shown when the user arrived via
                `?subject=` AND the canvas is still empty (#650). Offers
                an AI pre-fill from the linked entity. Self-hides as soon
                as widgets land or the user dismisses. */}
            <SubjectSeedBanner
              subject={urlSubject}
              canvasEmpty={state.scenes.every((s) => s.widgets.length === 0)}
              onSeed={(script) => {
                const hydrated = scriptToCanvasState(script);
                resetHistory(hydrated);
                setActiveSceneId(hydrated.scenes[0].id);
                setSelection({ kind: "scene", sceneId: hydrated.scenes[0].id });
              }}
            />
            {/* Canvas viewport — fixed-bounded relative wrapper. The
                scrollable stage is `absolute inset-0` so its size is
                fully determined by this wrapper (not by its contents),
                which means zooming can never push the outer chrome
                (timeline, header, side panels) out of the viewport.
                ZoomControl is a sibling, not a child, of the scroll
                container so it stays pinned to viewport edges instead of
                drifting off-left when the user scrolls a zoomed-in
                canvas horizontally. */}
            <div className="relative min-h-0 flex-1">
              <div
                ref={stageContainerRef}
                className="absolute inset-0 overflow-auto bg-muted/30 p-6"
              >
                {/* Audio-only-project hint banner — self-gates on
                    `mediaKind` + voiceover count so it returns null for
                    video projects + once the user records anything. Per
                    DRY: ONE component owns the visibility decision; the
                    host just supplies the recorder-arming callback. */}
                <AudioEmptyHint
                  mediaKind={currentMediaKind}
                  state={state}
                  onRecordVoiceover={() => {
                    setLeftTab("actions");
                    setLeftBottomOpen(true);
                  }}
                  className="mb-3"
                />
                <div className="flex min-h-full min-w-min items-center justify-center">
                  {/* Canvas-runtime dispatch (#931) — one router maps
                      `mediaKind` to the runtime surface that mounts.
                      Per the DRY rule the host doesn't know about
                      per-runtime contracts; each surface is built here
                      with the host-owned props it needs and the router
                      picks. Adding a new runtime is one entry in
                      `CanvasRuntimeSurfaces` + one surface assembled
                      here (#931 / PRD §1.2). */}
                  <CanvasRouter
                    mediaKind={currentMediaKind}
                    surfaces={{
                      game: (
                        <div className="relative">
                          <GameStage
                            // Reads LOCAL `gameState` so in-editor
                            // mutations (add level / move sprite /
                            // change behavior) refresh the canvas
                            // immediately without waiting for a save
                            // round-trip.
                            gameState={gameState}
                            zoom={zoom}
                            mode={gamePlaying ? "play" : "edit"}
                            // Selection props — canvas reflects what
                            // the user picked in the left rail; clicks
                            // on the canvas update the shared
                            // `gameSelection` so the right rail swaps
                            // to the clicked sprite's inspector.
                            activeLevelId={activeLevelId}
                            selectedSpriteId={selectedSpriteId}
                            onSelectSprite={(spriteId) => {
                              if (!activeLevelId) return;
                              if (spriteId) {
                                setGameSelection({ kind: "sprite", levelId: activeLevelId, spriteId });
                              } else {
                                setGameSelection({ kind: "level", levelId: activeLevelId });
                              }
                            }}
                            onMoveSprite={(spriteId, x, y) => {
                              if (!activeLevelId) return;
                              // Reuse the canonical sprite-update helper
                              // so drag-to-move + the inspector's x/y
                              // fields share one mutation path (DRY).
                              setGameState((prev) =>
                                prev ? gameUpdateSprite(prev, activeLevelId, spriteId, { x, y }) : prev,
                              );
                            }}
                            // Whole-state writer — the 3D path
                            // (engine === "world-3d") routes every
                            // mutation through here so place / select /
                            // delete / inspector edits all converge on
                            // the same `setGameState` setter the 2D
                            // path uses (DRY: one persistence pipeline).
                            // The 2D path ignores `onChange` and keeps
                            // using the fine-grained sprite handlers.
                            onChange={setGameState}
                            // The 3D agent + invite endpoints address
                            // the project by id — pass through so the
                            // panels can hit /api/games/:id/...
                            // Falsy when projectId === "new" (unsaved
                            // draft); the panels self-gate ("Save
                            // first" message). DRY: one prop, all 3D
                            // server surfaces.
                            projectId={projectId === "new" ? null : projectId}
                            // 3D entity selection bus — shared with
                            // the right-rail Game3DPropertiesPanel so
                            // clicking an entity in the canvas updates
                            // the inspector and vice-versa.
                            selectedEntityId={
                              gameSelection.kind === "entity-3d"
                                ? gameSelection.entityId
                                : null
                            }
                            onSelectEntity={(entityId) =>
                              setGameSelection(
                                entityId
                                  ? { kind: "entity-3d", entityId }
                                  : { kind: "canvas" },
                              )
                            }
                          />
                          {/* Playtest moved to the studio header (next
                              to Save) per the existing pattern — the
                              video editor's Preview button lives there
                              too. The canvas no longer carries
                              overlay chrome; selection + edit affordances
                              live in the left rail (palette) + right
                              rail (properties / challenges / AI). */}
                          {aiChipNode}
                        </div>
                      ),
                      image: (
                        <div className="relative">
                          <DrawingStage
                            state={imageState}
                            setState={setImageState}
                            commit={imageCommit}
                            zoom={zoom}
                            tool={imageTool}
                            brush={imageBrush}
                            onBrushChange={setImageBrush}
                            onRecentColor={pushImageRecentColor}
                            marquee={imageMarquee}
                            onMarqueeChange={setImageMarquee}
                            onMarqueeDelete={
                              imageMarquee ? handleImageMarqueeDelete : undefined
                            }
                            onMarqueeFill={
                              imageMarquee ? handleImageMarqueeFill : undefined
                            }
                            onMarqueeInpaint={
                              imageMarquee ? handleImageMarqueeInpaint : undefined
                            }
                            onLayerTransform={handleImageLayerTransform}
                            onCanvasReady={setImageCanvas}
                          />
                          {aiChipNode}
                        </div>
                      ),
                      animation: (
                        <div className="relative">
                          <AnimationStage
                            state={animationState}
                            setState={setAnimationState}
                            commit={animationCommit}
                            zoom={zoom}
                            tool={imageTool}
                            brush={imageBrush}
                            onBrushChange={setImageBrush}
                            onRecentColor={pushImageRecentColor}
                            isPlaying={animationPlaying}
                          />
                          {aiChipNode}
                        </div>
                      ),
                      cad: cadStateHydrated ? (
                        <CadStage
                          state={cadState}
                          setState={setCadState}
                          commit={cadCommit}
                          zoom={Math.max(0.5, zoom * 2)}
                          tool="select"
                          drawColor="#0f172a"
                          drawStrokeWidthMm={0.25}
                        />
                      ) : null,
                      cad_3d: cad3DStateHydrated ? (
                        <Cad3DStage
                          state={cad3DState}
                          setState={setCad3DState}
                          commit={cad3DCommit}
                          mode="edit"
                          className="absolute inset-0"
                        />
                      ) : null,
                      document: documentStateHydrated ? (
                        <DocumentStage
                          state={documentState}
                          setState={setDocumentState}
                          commit={documentCommit}
                          zoom={zoom}
                          entityContent={documentEntityContent}
                          onContentChange={setDocumentEntityContent}
                        />
                      ) : null,
                      timeline: (
                  <div className="relative">
                  {/* ONE renderer for both edit + playback: `<CanvasStage>`
                      in `mode="edit"` honours selection/drag/resize chrome,
                      in `mode="playback"` it filters widgets by the current
                      playhead's visibility window and suppresses every edit
                      affordance. Same DOM widgets, same text wrap, same
                      linked-content fidelity — no DOM-vs-canvas-2D divergence
                      between authoring and play. The canvas-2D
                      `renderTimelineFrame` survives only as the export
                      encoder for headless WebM output (#840 unification). */}
                  <CanvasStage
                    scene={
                      playback.isPlaying
                        ? state.scenes.find((s) => s.id === playback.activeSceneIdAtPlayhead) ?? activeScene
                        : activeScene
                    }
                    canvasWidth={state.width}
                    canvasHeight={state.height}
                    zoom={zoom}
                    mode={playback.isPlaying ? "playback" : "edit"}
                    currentTimeSec={
                      playback.isPlaying ? playback.activeSceneElapsed : undefined
                    }
                    selection={
                      playback.isPlaying
                        ? {
                            kind: "scene",
                            sceneId:
                              playback.activeSceneIdAtPlayhead ?? activeScene.id,
                          }
                        : selection
                    }
                    onSelect={playback.isPlaying ? undefined : setSelection}
                    onWidgetDrop={
                      playback.isPlaying
                        ? undefined
                        : (kind, at) => insertWidget(kind, at)
                    }
                    onWidgetMove={
                      playback.isPlaying ? undefined : updateWidgetPosition
                    }
                    onThemeDrop={
                      playback.isPlaying
                        ? undefined
                        : (themeId) => {
                            const theme = VISUAL_THEMES.find((t) => t.id === themeId);
                            if (!theme) return;
                            setState((prev) => applyThemeToState(prev, theme));
                            toast({ title: t("studio.editor.themeToast", { label: theme.label }) });
                          }
                    }
                    onBackgroundDrop={
                      playback.isPlaying
                        ? undefined
                        : (bgValue) => {
                            const preset = BG_PRESETS.find((p) => p.value === bgValue);
                            if (!preset) return;
                            updateScene(activeScene.id, scenePatchFromBgPreset(preset));
                            toast({ title: t("studio.editor.backgroundToast", { label: preset.label }) });
                          }
                    }
                    onMediaDrop={
                      playback.isPlaying
                        ? undefined
                        : (url, mediaType, atFraction) => {
                            if (mediaType === "video") {
                              addMediaWidget("video", url, 0, atFraction);
                            } else {
                              addMediaWidget("image", url, 0, atFraction);
                            }
                          }
                    }
                    onLinkedContentDrop={
                      playback.isPlaying
                        ? undefined
                        : (entityKind, entityId, atFraction) =>
                            insertLinkedContent(entityKind, entityId, atFraction)
                    }
                    onEngagementAssetDrop={
                      playback.isPlaying
                        ? undefined
                        : (assetKind, assetId, atFraction) =>
                            insertEngagementAsset(assetKind, assetId, atFraction)
                    }
                    onScreenshotDrop={
                      playback.isPlaying
                        ? undefined
                        : (atFraction) => placeScreenshot(atFraction)
                    }
                    defaultFontId={state.fontFamily}
                    projectId={persistedProjectId}
                  />
                  {aiChipNode}
                  </div>
                      ),
                    }}
                  />
                </div>
              </div>
              {/* Floating canvas-stage chrome — edit toolbar (left),
                  layers (center), zoom (right). Lives next to the
                  canvas rather than in the header / left rail so
                  scene-scoped ops sit beside the surface they act on
                  (#647). The layers popover opens upward so the canvas
                  isn't covered when expanded. Per the DRY rule the
                  toolbar's `history` prop is kind-aware — for image
                  projects it drives `imageHistory`, for Timeline kinds
                  it drives the CanvasState history. ONE undo/redo
                  affordance across the editor regardless of kind. */}
              <div className="pointer-events-none absolute left-3 bottom-3 z-10">
                <CanvasEditToolbar
                  history={
                    currentMediaKind === "image"
                      ? {
                          undo: imageUndo,
                          redo: imageRedo,
                          canUndo: imageCanUndo,
                          canRedo: imageCanRedo,
                        }
                      : currentMediaKind === "animation"
                        ? {
                            undo: animationUndo,
                            redo: animationRedo,
                            canUndo: animationCanUndo,
                            canRedo: animationCanRedo,
                          }
                        : currentMediaKind === "document"
                          ? {
                              undo: documentUndo,
                              redo: documentRedo,
                              canUndo: documentCanUndo,
                              canRedo: documentCanRedo,
                            }
                          : { undo, redo, canUndo, canRedo }
                  }
                  clipboard={clipboard}
                />
              </div>
              {/* Layers panel — kind-aware mount per DRY:
                    • image kind  → `<FloatingImageLayersPanel>` over
                      `imageState.layers`.
                    • Timeline kinds (video/podcast/voice/comic) →
                      `<FloatingLayersPanel>` over CanvasState widgets.
                    • everything else (animation/game/cad) → nothing.
                      Their canvases have no CanvasState widget stack, so
                      a widget-layers panel was misleading empty chrome.
                  Same `<FloatingCollapsiblePanel>` chrome where it
                  mounts; the component self-hides for kinds without a
                  layer model. */}
              <div className="pointer-events-none absolute left-1/2 bottom-3 z-10 -translate-x-1/2">
                {currentMediaKind === "image" ? (
                  <FloatingImageLayersPanel
                    state={imageState}
                    onAddLayer={handleImageAddLayer}
                    onAddLayerOfKind={handleImageAddLayerOfKind}
                    onDeleteLayer={handleImageDeleteLayer}
                    onSelectLayer={handleImageSelectLayer}
                    onToggleVisible={handleImageToggleVisible}
                    onRenameLayer={handleImageRenameLayer}
                    onSetOpacity={handleImageSetOpacity}
                    onSetBlendMode={handleImageSetBlendMode}
                    onSetFilters={handleImageSetFilters}
                    onMoveLayer={handleImageMoveLayer}
                  />
                ) : usesTimelineChrome ? (
                  <FloatingLayersPanel
                    scene={activeScene}
                    selectedWidgetId={
                      selection.kind === "widget" ? selection.widgetId : null
                    }
                    onSelectWidget={(widgetId) =>
                      setSelection({
                        kind: "widget",
                        sceneId: activeScene.id,
                        widgetId,
                      })
                    }
                    onReorderLayers={(widgetIds) =>
                      reorderLayers(activeScene.id, widgetIds)
                    }
                  />
                ) : null}
              </div>
              <div className="pointer-events-none absolute right-3 bottom-3 z-10">
                <ZoomControl zoom={zoom} onChange={setZoom} onFit={fitZoom} />
              </div>
              {/* The floating AI selection chip is no longer mounted
                  here — it lives inside each per-kind surface wrapper
                  via `aiChipNode` so its bbox prop (passed for game
                  sprites + timeline widgets) resolves against the
                  canvas's own coordinate space rather than the
                  viewport's. See the `surfaces` slots on
                  `<CanvasRouter/>` below. */}
            </div>
            {/* Bottom Timeline rail — Timeline-runtime scene/widget
                strip. Self-hides for game / image kinds per #936's
                predicate; their canvases don't have a time axis to
                surface here. */}
            {usesTimelineChrome && (
            <CollapsiblePanel
              side="bottom"
              label="Timeline"
              storageKey="studio.v2.panel.timeline"
            >
              <TimelineDock
                state={state}
                activeSceneId={activeSceneId}
                selection={selection}
                advancedOpen={advancedTimelineOpen}
                onToggleAdvanced={() => setAdvancedTimelineOpen((open) => !open)}
                onSelectScene={(id) => {
                  setActiveSceneId(id);
                  setSelection({ kind: "scene", sceneId: id });
                }}
                onSelectWidget={(sceneId, widgetId) => {
                  setActiveSceneId(sceneId);
                  setSelection({ kind: "widget", sceneId, widgetId });
                }}
                onSceneDurationChange={(sceneId, durationSeconds) =>
                  updateScene(sceneId, { durationSeconds })
                }
                onWidgetWindowChange={updateWidgetWindow}
                selectedAudio={selectedAudio}
                onSelectAudio={setSelectedAudio}
                onVoiceoverChange={handleVoiceoverChange}
                onMusicChange={handleMusicChange}
                onAudioCommit={handleAudioCommit}
              />
            </CollapsiblePanel>
            )}
          </section>

          {/* RIGHT — vertical column of stacked CollapsiblePanels. The
              row flex above lays the LEFT panel, middle section, and
              this column out horizontally; inside this column the
              panels stack VERTICALLY (each `side="right"` panel
              collapses HORIZONTALLY independently, sharing the column
              width).

              Today the column holds two panels:
                1. Properties / Game inspector / Drawing AI (kind-
                   aware — only one of the three mounts at a time)
                2. Cross-studio AI prompt (mounts for every non-image
                   kind — image already has the drawing AI panel on
                   top, which includes the prompt UX + extra knobs) */}
          <div className="flex flex-col">
          {/* PROPERTIES — also hosts the previously-DESIGN-tab
              configuration (themes / fonts / palette / motion / music /
              format / export) under a "Canvas" section group, surfaced
              when no widget is selected. Selecting a widget swaps the
              panel to that widget's meta.

              Self-hides for non-Timeline-authoring kinds (game / image)
              per #936's predicate. Game-kind mounts the dedicated
              `<GamePropertiesPanel/>` — selection-aware (canvas →
              game settings, level → level inspector, sprite → sprite
              inspector with sprite picker). Image-kind `<DrawingStage>`
              owns its own inline inspector so the right rail surfaces
              the AI prompt panel instead. */}
          {usesTimelineChrome ? (
          <CollapsiblePanel
            side="right"
            label="Properties"
            storageKey="studio.v2.panel.right"
            expandedClassName="w-72 flex-1 overflow-y-auto"
          >
            <PropertiesPanel
              state={state}
              selection={selection}
              onUpdateScene={updateScene}
              onDeleteScene={deleteScene}
              onDuplicateScene={duplicateScene}
              onUpdateWidgetPosition={updateWidgetPosition}
              onUpdateWidgetParams={updateWidgetParams}
              onUpdateWidget={updateWidget}
              onDeleteWidget={deleteWidget}
              onSelectTheme={(theme) =>
                setState((prev) => applyThemeToState(prev, theme))
              }
              onSelectBackground={(preset) =>
                updateScene(activeScene.id, scenePatchFromBgPreset(preset))
              }
              onSelectMusic={(track) => {
                if (track.id === "none") {
                  setState((prev) => ({ ...prev, musicSource: null }));
                  toast({ title: t("studio.editor.musicRemoved") });
                  return;
                }
                setState((prev) => ({
                  ...prev,
                  musicSource: { kind: "stock", trackId: track.id },
                }));
                toast({ title: t("studio.editor.musicToast", { label: track.label }) });
              }}
              onSelectFormat={(format) => {
                // Widgets are stored as fractional (0..1) positions so
                // they survive resolution changes without re-mapping.
                setState((prev) => ({
                  ...prev,
                  width: format.width,
                  height: format.height,
                }));
                toast({
                  title: t("studio.editor.formatToast", { label: format.label }),
                  description: `${format.width} × ${format.height}`,
                });
              }}
              onSelectCodec={(preset) => {
                setState((prev) => ({ ...prev, codec: preset.id }));
                toast({ title: `Export codec: ${preset.label}` });
              }}
              onSelectMotion={(preset) =>
                setState((prev) => ({ ...prev, motion: preset.id }))
              }
              onSelectTransition={(preset) =>
                setState((prev) => ({
                  ...prev,
                  defaultTransition: preset.id,
                }))
              }
              onSelectFont={(preset) =>
                setState((prev) => ({ ...prev, fontFamily: preset.id }))
              }
              onChangePalette={(palette) =>
                setState((prev) => ({ ...prev, colorPalette: palette }))
              }
            />
          </CollapsiblePanel>
          ) : currentMediaKind === "game" && gameState ? (
            <>
              <CollapsiblePanel
                side="right"
                label="Properties"
                storageKey="studio.v2.panel.right"
                expandedClassName="w-72"
              >
                {/* Game-kind right rail — selection-aware properties
                    panel. Same shell slot Timeline kinds use; the
                    content adapts to the selection AND to the engine:
                    canvas-2d projects use GamePropertiesPanel (sprite
                    inspector etc.); world-3d projects use
                    Game3DPropertiesPanel (entity inspector + 3D
                    canvas settings). One slot, two engines, no
                    visual fork — same CollapsiblePanel shell. */}
                {gameState.engine === "world-3d" ? (
                  <Game3DPropertiesPanel
                    gameState={gameState}
                    onChange={setGameState}
                    selection={gameSelection}
                    onSelectionChange={setGameSelection}
                  />
                ) : (
                  <GamePropertiesPanel
                    gameState={gameState}
                    onChange={setGameState}
                    selection={gameSelection}
                    onSelectionChange={setGameSelection}
                  />
                )}
              </CollapsiblePanel>
              {/* Challenges — 3D-only authoring CRUD panel mounted as
                  its own CollapsiblePanel below Properties. Same shell
                  the cross-studio AI panel uses (next sibling). Self-
                  gates inline (renders nothing for 2D mini-games). */}
              {gameState.engine === "world-3d" && (
                <CollapsiblePanel
                  side="right"
                  label="Challenges"
                  storageKey="studio.v2.panel.right.challenges"
                  expandedClassName="w-72"
                  defaultOpen={false}
                >
                  <div className="p-3">
                    <ChallengesPanel gameState={gameState} onChange={setGameState} />
                  </div>
                </CollapsiblePanel>
              )}
            </>
          ) : currentMediaKind === "image" ? (
            <CollapsiblePanel
              side="right"
              label="AI Prompt"
              storageKey="studio.v2.panel.right"
              expandedClassName="w-72"
            >
              {/* Image-kind right rail — the AI prompt panel mounts in
                  the SAME `<CollapsiblePanel/>` Timeline kinds use for
                  PropertiesPanel + game uses for GamePropertiesPanel.
                  One layout shell, kind-aware contents (per DRY). The
                  drawing kind uses the wrapped DrawingAiPromptPanel
                  (adds the Replace-layer + Transparent-BG knobs); other
                  kinds get the bare `MediaAiPromptPanel` mounted below
                  this switcher (next sibling). */}
              <DrawingAiPromptPanel
                history={imageState.aiPromptHistory}
                onGenerated={(result, prompt, options) =>
                  void handleImageAiGenerated(result, prompt, options)
                }
              />
            </CollapsiblePanel>
          ) : null}

          {/* Cross-studio AI prompt — appended to the right rail for
              every kind that doesn't already host an AI prompt panel
              (i.e. everything except image, which has the drawing
              wrapper above). Per the user's first-class AI rollout:
              every studio kind gets the same prompt UX, with kind-
              specific `onGenerated` handlers that drop the result onto
              the right canvas surface (sprite for game, frame for
              animation, image widget for timeline kinds). Same shell
              (`<CollapsiblePanel/>`), same shared body
              (`<MediaAiPromptPanel/>`) — DRY all the way down. */}
          {currentMediaKind !== "image" && (
            <CollapsiblePanel
              side="right"
              label="AI"
              storageKey="studio.v2.panel.right.ai"
              expandedClassName="w-72"
              defaultOpen={false}
            >
              {currentMediaKind === "game" && gameState ? (
                gameState.engine === "world-3d" ? (
                  /* 3D world projects host the game-builder AGENT here,
                     not a sprite-generator. The agent calls server-side
                     tools that mutate the world directly (place blocks,
                     add challenges, change lighting, etc.) — same
                     CollapsiblePanel shell every other kind's AI uses,
                     different consumer. Self-gates internally on
                     `projectId` ("save first" message when null). */
                  <AIAgentPanel
                    projectId={projectId === "new" ? null : projectId}
                    onApplyState={setGameState}
                  />
                ) : (
                  <MediaAiPromptPanel
                    kindNoun="sprite"
                    placeholder="A pixel-art hero sprite, side view…"
                    onGenerated={(result, prompt) =>
                      handleGameAiGenerated(result, prompt)
                    }
                  />
                )
              ) : currentMediaKind === "animation" ? (
                <MediaAiPromptPanel
                  kindNoun="frame"
                  placeholder="A bouncing ball, current frame mid-arc…"
                  onGenerated={(result) =>
                    void handleAnimationAiGenerated(result)
                  }
                />
              ) : (
                <MediaAiPromptPanel
                  kindNoun="image"
                  placeholder="A clean studio backdrop, soft warm lighting…"
                  onGenerated={(result) => {
                    // Timeline kinds (video/podcast/voice/comic): drop
                    // the generated image into the active scene as a
                    // new image widget. Reuses `addMediaWidget` — the
                    // SAME path the MediaPicker uses — so undo / save /
                    // export all behave identically regardless of
                    // image origin.
                    const url = result.resultUrl ?? result.previewUrl;
                    addMediaWidget("image", url, 0);
                  }}
                />
              )}
            </CollapsiblePanel>
          )}
          {/* Document (resume) — inline "Upload existing resume" below the AI
              panel. The user has already selected the resume they're editing,
              so this isn't a "create new" flow: dropping a file converts it and
              renders it on the CURRENT canvas in place (no slide-out, no
              navigation). Reuses the shared <ResumeUpload> form. */}
          {currentMediaKind === "document" && documentState.entityKind === "resume" && (
            <CollapsiblePanel
              side="right"
              label="Upload"
              storageKey="studio.v2.panel.right.upload"
              expandedClassName="w-80"
              defaultOpen={false}
            >
              <div className="p-3 text-sm">
                <p className="mb-3 text-xs text-muted-foreground">
                  Import an existing résumé (PDF / DOCX / TXT) to fill the canvas.
                </p>
                <ResumeUpload
                  compact
                  minimal
                  submitLabel="Convert & import"
                  targetResumeId={documentState.entityId ?? undefined}
                  onUploadSuccess={handleResumeUploaded}
                />
              </div>
            </CollapsiblePanel>
          )}
          </div>
        </div>
      </div>
      {/* Save as Course Lesson — see [AttachToCourseDialog](../../components/creator/AttachToCourseDialog.tsx)
          and the SaveMenuV2 publish-handler wiring above. Self-fetches the
          user's courses; renders a "Create a course" CTA when the list is
          empty. */}
      <AttachToCourseDialog
        open={attachToCourseOpen}
        onOpenChange={setAttachToCourseOpen}
        studioProjectId={persistedProjectId}
        defaultTitle={persistedProject?.title ?? undefined}
      />
      {/* SuperAdmin page→video embed (#1860) — publish onto a marketing
          page and/or copy an external snippet. Only reachable via the
          SuperAdmin-gated Embed button in the header. */}
      {embedDialogOpen && persistedProjectId && (
        <PageEmbedDialog
          open={embedDialogOpen}
          onOpenChange={setEmbedDialogOpen}
          projectId={persistedProjectId}
          rendered={!!persistedProject?.videoUrl}
          defaultPathname={searchParams.get("embedPath") ?? undefined}
          onEnsureRendered={async () => {
            const project = await ensureRendered();
            return !!project?.videoUrl;
          }}
        />
      )}
      {previewOpen && (
        <PreviewOverlay
          state={state}
          playback={playback}
          onClose={() => setPreviewOpen(false)}
        />
      )}
      {docPreviewOpen && currentMediaKind === "document" && (
        <DocumentPreviewOverlay
          state={documentState}
          content={documentEntityContent}
          title={title}
          onClose={() => setDocPreviewOpen(false)}
        />
      )}
      {/* 3D-world Invite dialog — modal mounted at the editor root so
          the InviteDialog's full-screen backdrop overlays everything.
          Trigger lives in the EditorHeader; this is the receiver. */}
      {gameInviteOpen && gameState?.engine === "world-3d" && (
        <InviteDialog
          projectId={projectId === "new" ? null : projectId}
          onClose={() => setGameInviteOpen(false)}
        />
      )}
      {/* LinkedIn publisher modal — opened by `onPublishToLinkedIn`
          AFTER ensureRendered has uploaded the video. Mirrors v1's
          StudioLayout LinkedIn modal so the publish UX is identical
          across editors (#653). */}
      {linkedInPublishOpen && persistedProjectId && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-card border rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-semibold">Publish to LinkedIn</h2>
              <button
                type="button"
                onClick={() => setLinkedInPublishOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <span className="sr-only">Close</span>
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="p-5">
              <Suspense
                fallback={
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    Loading…
                  </div>
                }
              >
                <LinkedInPublisher
                  projectId={persistedProjectId}
                  videoBlob={renderedBlobRef.current}
                  defaultText={state.scenes
                    .map((s) => s.label)
                    .filter(Boolean)
                    .join(". ")
                    .slice(0, 200)}
                  onPublished={(postId) => {
                    setLinkedInPublishOpen(false);
                    // LinkedIn's upload finishes in the browser, so record the
                    // publication from here (server-completed flows record
                    // their own). #1920.
                    const postUrl = `https://www.linkedin.com/feed/update/${postId}`;
                    if (persistedProjectId) {
                      void studioService
                        .recordPublication(persistedProjectId, {
                          destination: "linkedin",
                          externalId: postId,
                          externalUrl: postUrl,
                        })
                        .then(() => refreshPublications())
                        .catch(() => undefined);
                    }
                    toast({
                      title: "Published to LinkedIn!",
                      action: viewAction(postUrl),
                    });
                  }}
                />
              </Suspense>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Header — title field + back / save / preview buttons.
// ───────────────────────────────────────────────────────────────────────────

function EditorHeader({
  title,
  onTitleChange,
  onBack,
  onSave,
  saving,
  playback,
  onApplyLayoutBindings,
  persistedProjectId,
  persistedProject,
  onProjectChange,
  getVideoScript,
  hasContent,
  onOpenPreview,
  onOpenDocumentPreview,
  onExport,
  exporting,
  onPublishToYouTube,
  onPublishToLinkedIn,
  onPublishToProfile,
  onSaveImageToLibrary,
  onPublishAsCourseLesson,
  onEmbedOnPage,
  usesTimelineChrome,
  mediaKind,
  gameEngine,
  gamePlaying,
  onTogglePlaytest,
  animationPlaying,
  onToggleAnimationPlay,
  onOpenInvite,
  onExportRoblox,
  publications,
  onRepublish,
  republishing,
  onPublicationsChange,
}: {
  title: string;
  onTitleChange: (next: string) => void;
  onBack: () => void;
  onSave: () => void;
  saving: boolean;
  playback: ReturnType<typeof usePreviewPlayback>;
  /** Workspace-layout dropdown handler (#349). The header mounts the
   *  PreviewLayoutGroup (Preview + layout split-button) but defers the
   *  actual state flip to the parent so setLeftTab +
   *  setAdvancedTimelineOpen stay co-located with the rest of the
   *  editor's state. */
  onApplyLayoutBindings: (bindings: LayoutBindings) => void;
  persistedProjectId: string | null;
  persistedProject: StudioProject | null;
  onProjectChange: (next: StudioProject) => void;
  getVideoScript: () => unknown;
  hasContent: boolean;
  onOpenPreview: () => void;
  /** Document-kind preview (resume). Opens the fullscreen read-only
   *  `<DocumentPreviewOverlay>`; undefined for non-document kinds so the
   *  button self-gates. */
  onOpenDocumentPreview?: () => void;
  onExport: () => void;
  exporting: boolean;
  onPublishToYouTube: () => void;
  onPublishToLinkedIn: () => void;
  onPublishToProfile: () => void;
  /** Game-kind chrome — the header hosts Playtest + Invite next to
   *  Save (replacing the previous in-canvas overlays). Both buttons
   *  self-gate inline: Playtest only when mediaKind === "game",
   *  Invite only when the game's engine is "world-3d". */
  mediaKind: import("@shared/media-kinds").MediaKind;
  gameEngine: import("@shared/game-state").GameEngineId | null;
  gamePlaying: boolean;
  onTogglePlaytest: () => void;
  /** Animation-kind chrome — the header hosts Play/Pause next to Save
   *  (replacing the previous in-canvas play button), mirroring the
   *  video kind's Play affordance and game's Playtest. Self-gates inline
   *  on `mediaKind === "animation"`. */
  animationPlaying: boolean;
  onToggleAnimationPlay: () => void;
  onOpenInvite: () => void;
  /** Roblox export — undefined when the project isn't 3D-world. When
   *  set, the header renders an "Export → Roblox" button next to
   *  Invite. The actual XML generation + download lives in
   *  `lib/studio/game/roblox-export.ts` (gap #1661). */
  onExportRoblox?: () => void;
  /** Image-kind only: handler bound to the SaveMenu's `asset-library`
   *  publish destination. Falls through unbound (the dropdown row
   *  self-disables) for non-image projects. */
  onSaveImageToLibrary?: () => void;
  /** Opens the AttachToCourseDialog (Save as Course Lesson). Pass undefined
   *  when no project id is persisted yet — the SaveMenu row self-disables. */
  onPublishAsCourseLesson?: () => void;
  /** SuperAdmin "Embed" (#1860) — opens the PageEmbedDialog to publish the
   *  video onto a marketing page and/or copy an external snippet. Passed
   *  only for SuperAdmins on a persisted project; the button self-gates on
   *  the callback being defined. */
  onEmbedOnPage?: () => void;
  /** Drives whether the playback scrubber + Preview button render — the
   *  shared gate (#936) so non-Timeline kinds (game / image) don't see
   *  scene-shaped controls that don't apply to their runtime. */
  usesTimelineChrome: boolean;
  /** Publication records (#1920) — passed through to the Save menu's
   *  "Published to" section and the Details drawer. */
  publications: StudioPublication[];
  onRepublish: (destination: string) => void;
  republishing: string | null;
  /** Re-read the publication list — handed to the Details drawer so its
   *  full-history surface refreshes after a publish triggered elsewhere. */
  onPublicationsChange: () => void;
}) {
  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    return `${m}:${r.toString().padStart(2, "0")}`;
  };
  // Project-lifecycle + template actions (clone / delete / publish-as-
  // template) — folded into the Save dropdown's "More" group instead of a
  // standalone `…` overflow trigger. Self-gates to empty slots for unsaved
  // drafts. The dialogs render outside the dropdown (see hook docs).
  const projectChrome = useProjectChrome({
    project: persistedProject,
    getVideoScript,
  });
  return (
    <header className="flex items-center justify-between gap-4 border-b border-border bg-card px-4 py-2">
      <div className="flex flex-1 items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="gap-1 px-2"
          aria-label="Back to studio"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        {/* Title field is editable — the transparent border made that
            non-obvious, so a Pencil hint fades in on hover to advertise
            the affordance without changing the input behaviour. */}
        <div className="group relative flex items-center">
          <Input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            className="h-8 max-w-xs border-transparent bg-transparent pr-7 text-sm font-medium shadow-none focus-visible:border-border"
          />
          <Pencil
            className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-0"
            aria-hidden="true"
          />
        </div>
        {/* Details drawer — visibility, SEO metadata, engagement tools, and
            heatmap/geo/CTR metrics all live in the shared <EntityDetailsSheet>
            chrome (Gap Register #1019). The adapter owns its own [🌐 Details]
            trigger button so the editor header doesn't need its own click
            handler. Self-gates on a saved project — nothing to expose for a
            draft and on the viewer's permission (creator + admins only). */}
        {persistedProject && (
          <ProjectDetailsSheet
            project={persistedProject}
            onChange={onProjectChange}
            publications={publications}
            onRepublish={onRepublish}
            republishing={republishing}
            onRefreshPublications={onPublicationsChange}
          />
        )}
      </div>
      {/* Playback controls — Play/Pause + scrubber + timecode. Drives the
          shared `usePreviewPlayback` hook so the canvas/widgets/scenes
          all see the same playhead (DRY). */}
      {/* Playback scrubber self-hides for non-Timeline-authoring kinds
          (game / image) per #936's predicate. Those runtimes own their
          own play affordance (`<GameStage>`'s Playtest button /
          `<DrawingStage>`'s toolbar) so a global timeline scrubber
          would be a misleading control. The empty flex-1 spacer keeps
          the title block + right actions visually balanced. */}
      {usesTimelineChrome ? (
        <div className="flex flex-1 items-center justify-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => playback.seek(0)}
            aria-label="Back to start"
            className="h-8 w-8 p-0"
          >
            <SkipBack className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={playback.toggle}
            aria-label={playback.isPlaying ? "Pause preview" : "Play preview"}
            className="h-8 w-8 p-0"
          >
            {playback.isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
          <input
            type="range"
            min={0}
            max={Math.max(0.1, playback.duration)}
            step={0.05}
            value={playback.playhead}
            onChange={(e) => playback.seek(Number(e.target.value))}
            className="h-1 w-40 cursor-pointer accent-brand-purple"
            aria-label="Playhead"
          />
          <span className="min-w-[5.5rem] text-center text-[10px] tabular-nums text-muted-foreground">
            {fmt(playback.playhead)} / {fmt(playback.duration)}
          </span>
        </div>
      ) : (
        <div className="flex-1" />
      )}
      <div className="flex items-center gap-2">
        {/* "+ New Video" + Wizard live on the Studio landing (`/studio`,
            reachable via the ← Back arrow). Putting them on the per-
            project header conflated "make ANOTHER project" with "do
            something to THIS project".
            Preview + workspace-layout are one joined button group
            (PreviewLayoutGroup) — the Preview action and the layout-mode
            dropdown read as a single control instead of two adjacent
            "Preview"-labelled buttons. The Preview half self-gates: it
            renders only for Timeline-authoring kinds (the `PreviewOverlay`
            it opens is Timeline-shaped playback, which doesn't apply to
            game — uses GameStage's Playtest toggle — or image — no
            playback), collapsing the group to just the layout dropdown for
            those kinds. Layout presets apply to every kind, so the
            dropdown always renders. */}
        {/* Document-kind Preview — opens the fullscreen read-only paged
            review (resume). Self-gates on the callback, which the parent only
            binds for the document mediaKind. */}
        {onOpenDocumentPreview && (
          <Button
            variant="secondary"
            size="sm"
            className="h-8 gap-1"
            onClick={onOpenDocumentPreview}
          >
            <Eye className="h-4 w-4" />
            Preview
          </Button>
        )}
        <PreviewLayoutGroup
          onApplyLayout={onApplyLayoutBindings}
          onOpenPreview={usesTimelineChrome ? onOpenPreview : undefined}
        />
        {/* Game-kind Playtest — same slot the video editor uses for
            Preview, mounting only when the project is game-kind. Was
            previously a canvas overlay; moved here to match the
            studio's existing chrome pattern (header actions, not
            in-canvas floaters). */}
        {mediaKind === "game" && (
          <Button
            variant="secondary"
            size="sm"
            className="h-8 gap-1"
            onClick={onTogglePlaytest}
          >
            {gamePlaying ? (
              <>
                <Pause className="h-4 w-4" />
                Stop
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Playtest
              </>
            )}
          </Button>
        )}
        {/* Animation-kind Play/Pause — same header slot the video editor
            uses for Play and game uses for Playtest. Was previously a
            button embedded in the canvas frame-strip; moved here so every
            kind's playback control lives in the same place (header
            actions, not in-canvas floaters). */}
        {mediaKind === "animation" && (
          <Button
            variant="secondary"
            size="sm"
            className="h-8 gap-1"
            onClick={onToggleAnimationPlay}
            aria-label={animationPlaying ? "Pause animation" : "Play animation"}
          >
            {animationPlaying ? (
              <>
                <Pause className="h-4 w-4" />
                Pause
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Play
              </>
            )}
          </Button>
        )}
        {/* 3D-world Invite — appears only for engine === "world-3d"
            projects (the canvas-2d mini-games don't have a multi-
            user share surface). Same header slot as Playtest above. */}
        {mediaKind === "game" && gameEngine === "world-3d" && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1"
            onClick={onOpenInvite}
          >
            <UserPlus className="h-4 w-4" />
            Invite
          </Button>
        )}
        {/* Export to Roblox — generates a `.rbxlx` place file from the
            authored world (gap #1661 follow-on). Only meaningful for
            3D-world projects; self-gates via the optional callback. */}
        {mediaKind === "game" && gameEngine === "world-3d" && onExportRoblox && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1"
            onClick={onExportRoblox}
            title="Export as Roblox place file (.rbxlx)"
          >
            <Download className="h-4 w-4" />
            Roblox
          </Button>
        )}
        {/* SuperAdmin "Embed" (#1860) — self-gates on the optional handler,
            which the parent only binds for SuperAdmins on a saved project. */}
        {onEmbedOnPage && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1"
            onClick={onEmbedOnPage}
            title="Embed this video on a page"
          >
            <Code2 className="h-4 w-4" />
            Embed
          </Button>
        )}
        {/* Single split-button for the whole project: Save (primary —
            persists draft) + chevron-dropdown with Export MP4, Copy
            link, and Publish (YouTube / LinkedIn / Profile). Replaces
            the prior separate Export and Save buttons so the user sees
            one cluster instead of two adjacent controls. */}
        <StudioSaveMenuV2
          saving={saving}
          onSave={onSave}
          hasContent={hasContent}
          mediaKind={persistedProject?.mediaKind ?? "video"}
          projectId={persistedProjectId}
          slug={persistedProject?.slug ?? null}
          hasVideo={!!persistedProject?.videoUrl}
          isPublishedToProfile={persistedProject?.status === "Published"}
          onExport={onExport}
          exporting={exporting}
          publishHandlers={{
            youtube: onPublishToYouTube,
            linkedin: onPublishToLinkedIn,
            profile: onPublishToProfile,
            // Image-kind asset library handoff (#933). When bound the
            // SaveMenu's `asset-library` row enables; otherwise the
            // menu self-disables it. Same uploadImage() port the
            // MediaPicker uses — closes the create→reuse loop.
            ...(onSaveImageToLibrary
              ? { "asset-library": onSaveImageToLibrary }
              : {}),
            // Course-lesson handoff (#160). When bound (project has been
            // persisted at least once), the SaveMenu's "Save as Course
            // Lesson" row opens AttachToCourseDialog. Unbound for drafts
            // because `studio_video` lessons need a real project id.
            ...(onPublishAsCourseLesson
              ? { "course-lesson": onPublishAsCourseLesson }
              : {}),
          }}
          publications={publications}
          onRepublish={onRepublish}
          republishing={republishing}
          moreItems={projectChrome.items}
          moreDialogs={projectChrome.dialogs}
        />
      </div>
    </header>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// TimelineDock — the always-visible scene strip plus a collapsible
// AdvancedTimeline (multi-track view). Per the user's brief: "Timeline
// and advanced opens will still show in the bottom of the canvas panel".
// The strip stays mounted; the advanced view toggles open above it.
// ───────────────────────────────────────────────────────────────────────────

// Tab selector for the bottom half of the left rail. Widgets = the
// drag-and-drop palette (which now hosts the shared `MediaSection` with
// the embedded source bin); Actions = recording / AI tools / captions /
// engagement (v1 dialogs mounted via ActionsPanel adapters). Project-
// wide configuration (themes / fonts / palette / motion / music /
// format / export) now lives in the right inspector under the "Canvas"
// section group — selecting nothing on the canvas surfaces it there.
const LEFT_TABS = [
  { id: "widgets", label: "Widgets" },
  { id: "actions", label: "Actions" },
] as const;
type LeftTabId = (typeof LEFT_TABS)[number]["id"];

function LeftTabs({
  tab,
  onChange,
  expanded,
  onToggle,
}: {
  tab: LeftTabId;
  onChange: (next: LeftTabId) => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-stretch border-y border-border">
      {LEFT_TABS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => {
            // Re-clicking a tab when the section is collapsed re-opens it;
            // otherwise it's a plain tab switch.
            if (!expanded) onToggle();
            onChange(id);
          }}
          className={cn(
            "flex-1 py-2 text-[10px] font-semibold uppercase tracking-wide transition",
            tab === id && expanded
              ? "border-b-2 border-brand-purple text-foreground"
              : "border-b-2 border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
      <button
        type="button"
        onClick={onToggle}
        aria-label={expanded ? "Collapse widgets/actions" : "Expand widgets/actions"}
        className="flex h-9 w-9 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronUp className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}

function TimelineDock({
  state,
  activeSceneId,
  selection,
  advancedOpen,
  onToggleAdvanced,
  onSelectScene,
  onSelectWidget,
  onSceneDurationChange,
  onWidgetWindowChange,
  selectedAudio,
  onSelectAudio,
  onVoiceoverChange,
  onMusicChange,
  onAudioCommit,
}: {
  state: CanvasState;
  activeSceneId: string | null;
  selection: Selection;
  advancedOpen: boolean;
  onToggleAdvanced: () => void;
  onSelectScene: (sceneId: string) => void;
  onSelectWidget: (sceneId: string, widgetId: string) => void;
  onSceneDurationChange: (sceneId: string, durationSeconds: number) => void;
  onWidgetWindowChange: (
    widgetId: string,
    visibleFrom: number | null,
    visibleTo: number | null,
  ) => void;
  selectedAudio: import("@/components/studio/v2/AdvancedTimeline").AudioSelection | null;
  onSelectAudio: (sel: import("@/components/studio/v2/AdvancedTimeline").AudioSelection) => void;
  onVoiceoverChange: (id: string, patch: import("@/components/studio/v2/AdvancedTimeline").AudioPatch) => void;
  onMusicChange: (patch: import("@/components/studio/v2/AdvancedTimeline").AudioPatch) => void;
  onAudioCommit: () => void;
}) {
  const total = totalDurationSeconds(state);
  const selectedWidgetId =
    selection.kind === "widget" ? selection.widgetId : null;
  // Outer border + bg come from the wrapping CollapsiblePanel; this
  // root is a plain block. The collapse toggle half-protrudes above
  // the top-left edge of the panel, so the header row needs no padding
  // adjustment — the toggle never overlaps content.
  return (
    <div>
      {advancedOpen && (
        <AdvancedTimeline
          state={state}
          activeSceneId={activeSceneId}
          selectedWidgetId={selectedWidgetId}
          onSelectScene={onSelectScene}
          onSelectWidget={onSelectWidget}
          onSceneDurationChange={onSceneDurationChange}
          onWidgetWindowChange={onWidgetWindowChange}
          selectedAudio={selectedAudio}
          onSelectAudio={onSelectAudio}
          onVoiceoverChange={onVoiceoverChange}
          onMusicChange={onMusicChange}
          onAudioCommit={onAudioCommit}
        />
      )}
      <div className="px-4 py-3">
        <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
          <span>Timeline</span>
          <div className="flex items-center gap-3">
            <span>Total {total.toFixed(1)}s</span>
            <button
              type="button"
              onClick={onToggleAdvanced}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={advancedOpen ? "Hide advanced timeline" : "Show advanced timeline"}
            >
              Advanced
              {advancedOpen ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronUp className="h-3 w-3" />
              )}
            </button>
          </div>
        </div>
        <div className="flex h-10 items-stretch gap-1">
          {state.scenes.map((scene) => {
            const pct = total > 0 ? (scene.durationSeconds / total) * 100 : 0;
            const active = scene.id === activeSceneId;
            return (
              <button
                key={scene.id}
                type="button"
                onClick={() => onSelectScene(scene.id)}
                style={{ flexBasis: `${pct}%` }}
                className={cn(
                  "flex min-w-[3rem] items-center justify-center rounded border text-[10px] font-medium transition",
                  active
                    ? "border-brand-purple bg-brand-purple/10 text-brand-purple"
                    : "border-border bg-background hover:bg-muted",
                )}
              >
                <span className="truncate px-1">{scene.label}</span>
              </button>
            );
          })}
        </div>
        <AudioTimelineRow state={state} />
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// AudioTimelineRow — single read-only row under the scene strip showing
// the active music track + voiceover clips so the user can see at a
// glance that their pick landed on the composition. Editing audio
// timing happens in the Advanced timeline (gap-registered for full
// per-clip editing). Self-gates: returns null when there's no audio.
// ───────────────────────────────────────────────────────────────────────────

function AudioTimelineRow({ state }: { state: CanvasState }) {
  const music = resolveMusic(state.musicSource);
  if (!music && state.voiceovers.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-col gap-1">
      {music && (
        <div className="flex h-7 items-center gap-2 rounded border border-emerald-500/40 bg-emerald-500/10 px-2 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
          <Music className="h-3 w-3" />
          <span className="truncate">Music · {music.label}</span>
        </div>
      )}
      {state.voiceovers.map((vo) => (
        <div
          key={vo.id}
          className="flex h-7 items-center gap-2 rounded border border-sky-500/40 bg-sky-500/10 px-2 text-[10px] font-medium text-sky-700 dark:text-sky-300"
        >
          <Mic className="h-3 w-3" />
          <span className="truncate">
            Voiceover · {vo.label} ({vo.durationSeconds.toFixed(1)}s)
          </span>
        </div>
      ))}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Initial state hydration — checks localStorage first, then falls back
// to an empty canvas keyed off the template hint.
// ───────────────────────────────────────────────────────────────────────────

function hydrateInitialState(
  projectId: string,
  templateHint: string | null,
): CanvasState {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(LOCAL_STORAGE_PREFIX + projectId);
      if (raw) {
        const parsed = JSON.parse(raw) as { state?: CanvasState };
        if (parsed.state && Array.isArray(parsed.state.scenes) && parsed.state.scenes.length > 0) {
          return parsed.state;
        }
      }
    } catch {
      // Fall through to seed-from-template.
    }
  }
  // Template-seeded layouts ship from a shared catalog — see
  // `lib/studio/editor-v2/template-seeds.ts`. Unknown template ids fall
  // through to an empty canvas without throwing.
  return seedCanvasFromTemplate(templateHint);
}
