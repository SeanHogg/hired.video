/**
 * v2 Actions panel — mounts the EXISTING v1 action dialogs (Webcam,
 * StockMedia, Captions, Headshot, Original Music, AI Rewrite, AI Hook
 * Optimizer, Voiceover) so v2 users get feature parity with the v1
 * Actions tab.
 *
 * Per the standing DRY rule: every dialog rendered here is the v1
 * component, untouched. The v2 ↔ v1 boundary lives in callbacks — each
 * action button knows how to translate the dialog's emitted result into
 * a CanvasState mutation (drop a widget, append a voiceover, set
 * captions, …). No dialog is forked.
 *
 * Hard-no v1 surfaces (AudioMixerDialog, ChapterEditor, ThumbnailsDialog)
 * are exposed as disabled buttons with a "Open in classic editor" tooltip
 * until they're refactored to accept generic callbacks — tracked in the
 * gap register.
 */
import { lazy, Suspense, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ActionId } from "@/lib/studio/editor-v2/editor-types";
import {
  RECORDING_MODE_ACTION,
  recordingModeForAction,
} from "@/lib/studio/recording-modes";
import {
  Accessibility,
  Captions,
  Languages,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import LeftPanelScroller, { LeftPanelSection } from "./LeftPanelScroller";
import LeftPanelTile from "./LeftPanelTile";
import MediaSection from "./MediaSection";
import RecordingSection from "./RecordingSection";
import { useCollapsibleSections } from "@/lib/hooks/useCollapsibleSections";
import { mediaKindHasAudio, mediaKindHasVideo } from "@shared/media-kinds";
import {
  makeAudioLayer,
  type AudioLayer,
  type CanvasAudioMix,
  type CanvasCaptions,
  type CanvasCaptionCue,
  type CanvasState,
  type Scene,
  type Widget,
  type WidgetKind,
} from "@/lib/studio/editor-v2/canvas-state";

// Lazy-load every dialog so the editor's initial bundle doesn't pull
// MediaRecorder / Web Audio / camera permissions when the user just
// wants to drag a text widget. Each Suspense fallback keeps the sheet
// open so click-to-open feels instant. The webcam recorder is wrapped
// by `WebcamRecorderWithUpload` so every "record → URL" surface in the
// app (Actions panel here, Webcam widget inspector) shares one
// upload + fallback pipeline.
const WebcamRecorderWithUpload = lazy(
  () => import("@/components/studio/WebcamRecorderWithUpload"),
);
const HeadshotGenerator = lazy(() => import("@/components/studio/HeadshotGenerator"));
// The shared MusicComposer ("Step Sequencer / Piano" tabs) plus the upload
// outcome: a composed track lands on the canvas only once it is hosted.
const ComposedMusicAction = lazy(
  () => import("@/components/studio/v2/ComposedMusicAction"),
);
const CaptionEditor = lazy(() => import("@/components/studio/CaptionEditor"));
const ScriptRewriterDialog = lazy(
  () => import("@/components/studio/ScriptRewriterDialog"),
);
const HookOptimizerDialog = lazy(
  () => import("@/components/studio/HookOptimizerDialog"),
);
const VoiceoverPanel = lazy(() => import("@/components/studio/VoiceoverPanel"));
const StudioAccessibilityPanel = lazy(
  () => import("@/components/studio/StudioAccessibilityPanel"),
);
const StudioDubbingPanel = lazy(
  () => import("@/components/studio/dubbing/StudioDubbingPanel"),
);
const V2AdvisoryDialogs = lazy(() => import("./V2AdvisoryDialogs"));
const AudioMixerV2 = lazy(() => import("./AudioMixerV2"));
// Chapters / Thumbnails / Forms / Review Comments — the authoring
// dialog cluster (#675). Editor-only mount; the Details drawer renders
// viewer results via `EngagementResultsPanel` instead.
const EngagementToolset = lazy(
  () => import("@/components/studio/shared/EngagementToolset"),
);
// Project-scoped palette section listing the authored forms / chapters /
// thumbnails / review threads as draggable canvas tiles (#1579). Surfaces
// the assets created via EngagementToolset above so they can be bound
// to scenes instead of orbiting unrendered on the server.
const EngagementAssetPaletteSection = lazy(
  () => import("./EngagementAssetPaletteSection"),
);

export interface ActionsPanelProps {
  state: CanvasState;
  activeScene: Scene;
  selectedWidget: Widget | null;
  persistedProjectId: string | null;
  /** Server-side video id for the rendered MP4, if the project has
   *  been published. Used by the Analytics advisory dialog. */
  videoId?: string | null;
  onAddVideoWidget: (url: string, durationSeconds: number) => void;
  onAddImageWidget: (url: string) => void;
  onAddVoiceover: (layer: AudioLayer) => void;
  /** Drops a blank widget (image / video / webcam) onto the active
   *  scene — threaded into the shared `MediaSection` so the Actions-tab
   *  mount has feature parity with the Widgets-tab mount. */
  onInsertWidget: (kind: WidgetKind) => void;
  /** Capture-screen-then-place-as-Image flow. Wired into the shared
   *  `MediaSection`'s Screenshot tile. */
  onCaptureScreenshot: () => void;
  onSetCaptions: (captions: CanvasCaptions) => void;
  /** Hosts a composed track and adds it as music; `false` = not saved (#563). */
  onSetMusicFromBlob: (blob: Blob, durationSeconds: number, label: string) => Promise<boolean>;
  onUpdateWidgetText: (widgetId: string, nextText: string) => void;
  /** Adapter for the Version History advisory dialog — host converts
   *  the restored v1 script via `scriptToCanvasState` and applies it. */
  onRestoreCanvas?: (next: CanvasState) => void;
  /** Patch the canvas-level audio mix (master / lane gains + mutes).
   *  Required when the Engagement section's audio-mixer trigger is
   *  visible — the mixer can't compose without a way to mutate state. */
  onPatchAudioMix?: (patch: Partial<CanvasAudioMix>) => void;
  /** Patch one audio layer's per-layer gain / muted (any kind). */
  onPatchVoiceover?: (layerId: string, patch: { gain?: number; muted?: boolean }) => void;
  /** When set, the panel auto-opens this action on mount. Drives the
   *  `?capture=screen|webcam|screen+webcam` deep-link from chrome
   *  extensions and "Record promo" CTAs (#651) — caller maps the URL
   *  param to the matching ActionId. Fires only once per panel mount;
   *  subsequent changes are ignored so a user closing the sheet doesn't
   *  re-trigger it. */
  defaultOpenAction?: ActionId;
  /** Controlled open-action. When `onOpenActionChange` is supplied the
   *  panel is CONTROLLED — the host owns which sheet is open, so the
   *  Alt+Shift+R shortcut and the AI CHRO can open the recorder at
   *  runtime (and the open sheet survives left-tab switches, which would
   *  otherwise unmount this panel's internal state). When omitted the
   *  panel falls back to internal state seeded once by
   *  `defaultOpenAction` (the `?capture=` deep-link path). */
  openAction?: ActionId | null;
  onOpenActionChange?: (next: ActionId | null) => void;
  /** When true, a finished recording becomes a new full-bleed scene via
   *  `onAddRecordingScene` instead of a video widget on the active scene.
   *  Set by the host when the recorder was armed through the Alt+Shift+R
   *  shortcut or the AI CHRO (the slide → recording → slide flow). */
  recordAsScene?: boolean;
  /** Append the finished recording as its own full-bleed scene. Required
   *  for the `recordAsScene` path; falls back to `onAddVideoWidget`
   *  (overlay on the active scene) when absent. */
  onAddRecordingScene?: (url: string, durationSeconds: number) => void;
  /** Preview-playback time in seconds. Threaded into
   *  ReviewCommentsDialog so a new review comment anchors to wherever
   *  the user is scrubbing in the preview (#654). */
  currentTimeSec?: number;
  /** Click-to-insert handler for the engagement-asset palette tiles
   *  (#1579). Drag uses the dataTransfer protocol via `writeDragPayload`
   *  and ends up in the CanvasStage drop dispatcher; this callback
   *  covers the click path. Caller appends a new `engagement-asset`
   *  widget to the active scene bound to the picked asset id. */
  onInsertEngagementAsset?: (
    assetKind: import("@/lib/studio/editor-v2/engagement-assets").EngagementAssetKind,
    assetId: string,
  ) => void;
  /** Active project media kind. Audio-only kinds (voice / podcast) default
   *  to the "Recording & Audio" section expanded and everything else
   *  collapsed (#925) — the video-shaped all-open default buries the only
   *  section those projects use. Omit (or pass a video/both kind) to keep
   *  the all-open default. */
  mediaKind?: import("@shared/media-kinds").MediaKind;
}

const SECTION_IDS = ["recording", "media", "ai", "engagement", "advisory"] as const;
type SectionId = (typeof SECTION_IDS)[number];

export default function ActionsPanel(props: ActionsPanelProps) {
  // Controlled when the host passes `onOpenActionChange`; otherwise the
  // panel owns the state, seeded once by `defaultOpenAction`. One reader
  // (`openAction`) + one writer (`setOpenAction`) downstream regardless.
  const [internalOpenAction, setInternalOpenAction] = useState<ActionId | null>(
    props.defaultOpenAction ?? null,
  );
  const isControlled = props.onOpenActionChange !== undefined;
  const openAction = isControlled ? props.openAction ?? null : internalOpenAction;
  const setOpenAction = isControlled
    ? props.onOpenActionChange!
    : setInternalOpenAction;
  const close = useCallback(() => setOpenAction(null), [setOpenAction]);
  // Shared multi-open accordion state — every left-rail panel uses the
  // SAME hook so the open/close UX is identical across Widgets / Design
  // / Actions tabs.
  // #925 — audio-only kinds (voice / podcast) lead with "Recording &
  // Audio" expanded and everything else collapsed; the video-shaped
  // all-open default otherwise buries the only section they use. Persisted
  // state still wins, so a user who customises keeps their layout.
  const audioOnly =
    props.mediaKind != null &&
    mediaKindHasAudio(props.mediaKind) &&
    !mediaKindHasVideo(props.mediaKind);
  const { t } = useTranslation();
  const sections = useCollapsibleSections<SectionId>(SECTION_IDS, {
    storageKey: "studio.v2.left.actions.sections",
    defaultClosed: audioOnly,
    initialOpen: audioOnly ? new Set<SectionId>(["recording"]) : undefined,
  });

  return (
    <LeftPanelScroller>
      <RecordingSection
        open={sections.isOpen("recording")}
        onToggle={() => sections.toggle("recording")}
        openAction={openAction}
        onOpenAction={setOpenAction}
      />

      {/* Shared MediaSection — same component the Widgets tab mounts.
          Owns the Image / Video / Webcam blank tiles, Screenshot, the
          Upload / Stock / AI picker dialog, AI Headshot, AND the
          embedded source bin (the former "Media" left-rail tab). */}
      <MediaSection
        open={sections.isOpen("media")}
        onToggle={() => sections.toggle("media")}
        onInsertImage={() => props.onInsertWidget("image")}
        onInsertVideo={() => props.onInsertWidget("video")}
        onInsertWebcam={() => props.onInsertWidget("webcam")}
        onCaptureScreenshot={props.onCaptureScreenshot}
        onAddImageWidget={props.onAddImageWidget}
        onAddVideoWidget={props.onAddVideoWidget}
        onAddAudioLayer={props.onAddVoiceover}
        activeSceneId={props.activeScene.id}
        onOpenAiHeadshot={() => setOpenAction("ai-headshot")}
      />

      <LeftPanelSection
        title={t("studio.actions.aiTools")}
        open={sections.isOpen("ai")}
        onToggle={() => sections.toggle("ai")}
        contentClassName="grid grid-cols-2 gap-2"
      >
        <LeftPanelTile
          label={t("studio.actions.rewrite")}
          icon={WandSparkles}
          onClick={() => setOpenAction("ai-rewrite")}
        />
        <LeftPanelTile
          label={t("studio.actions.hook")}
          icon={Sparkles}
          onClick={() => setOpenAction("ai-hook")}
        />
      </LeftPanelSection>

      <LeftPanelSection
        title={t("studio.actions.engagement")}
        open={sections.isOpen("engagement")}
        onToggle={() => sections.toggle("engagement")}
        contentClassName="grid gap-2"
      >
        <LeftPanelTile
          label={t("studio.actions.captions")}
          icon={Captions}
          onClick={() => setOpenAction("captions")}
        />
        <LeftPanelTile
          label={t("studio.actions.accessibility")}
          icon={Accessibility}
          onClick={() => setOpenAction("accessibility")}
        />
        <LeftPanelTile
          label={t("studio.actions.dubbing")}
          icon={Languages}
          onClick={() => setOpenAction("dubbing")}
        />
        {/* Chapters / Thumbnails / Forms / Reviews — authoring cluster
            (#675). Self-gates on projectId so an unsaved draft hides
            the whole row. */}
        <Suspense fallback={null}>
          <EngagementToolset
            projectId={props.persistedProjectId}
            sceneBoundaries={props.state.scenes.map((s, idx) => ({
              title: s.label,
              start: props.state.scenes
                .slice(0, idx)
                .reduce((sum, prev) => sum + prev.durationSeconds, 0),
            }))}
            videoUrl={props.videoId ?? null}
            durationSec={props.state.scenes.reduce(
              (sum, s) => sum + s.durationSeconds,
              0,
            )}
            currentTimeSec={props.currentTimeSec}
          />
        </Suspense>
        {/* Draggable tiles for every authored engagement asset on this
            project — closes the orphan-binding half of #1579 by giving
            forms / chapters / thumbnails / reviews a canvas presence.
            Self-gates on projectId (returns null until the draft is
            saved); inner sections fetch their kind on first open. */}
        {props.onInsertEngagementAsset && (
          <Suspense fallback={null}>
            <EngagementAssetPaletteSection
              projectId={props.persistedProjectId}
              onInsert={props.onInsertEngagementAsset}
            />
          </Suspense>
        )}
        {/* V2-native audio mixer (#645) — self-gates: returns null when
            the state has no music + no voiceovers (no audio to mix).
            Operates directly on CanvasState.audioMix + voiceovers, no
            v1 VideoScript projection. */}
        {props.onPatchAudioMix && props.onPatchVoiceover && (
          <Suspense fallback={null}>
            <AudioMixerV2
              state={props.state}
              onPatchMix={props.onPatchAudioMix}
              onPatchVoiceover={props.onPatchVoiceover}
            />
          </Suspense>
        )}
      </LeftPanelSection>

      <LeftPanelSection
        title={t("studio.actions.advisoryLifecycle")}
        open={sections.isOpen("advisory")}
        onToggle={() => sections.toggle("advisory")}
        contentClassName="grid gap-2"
      >
        {/* Self-gating component — returns null when no project has
            been persisted yet (every advisory tool needs a projectId).
            Each dialog inside mounts its own trigger button so the
            consumer just drops <V2AdvisoryDialogs/> and the buttons
            appear (#612). */}
        <Suspense fallback={null}>
          <V2AdvisoryDialogs
            projectId={props.persistedProjectId}
            videoId={props.videoId ?? null}
            state={props.state}
            mediaKind={props.mediaKind}
            onRestoreCanvasFromScript={(next) => props.onRestoreCanvas?.(next)}
          />
        </Suspense>
      </LeftPanelSection>

      {/* Spread props FIRST so the resolved `openAction` (controlled or
          internal) and `close` win over the raw `props.openAction`. */}
      <ActionSheet
        {...props}
        openAction={openAction}
        onOpenAction={setOpenAction}
        onClose={close}
      />
    </LeftPanelScroller>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// ActionSheet — single Sheet host that renders whichever dialog is
// currently selected. Each dialog handler is a thin v1↔v2 adapter.
// ───────────────────────────────────────────────────────────────────────────

function ActionSheet({
  openAction,
  onOpenAction,
  onClose,
  state,
  activeScene,
  selectedWidget,
  persistedProjectId,
  onAddVideoWidget,
  onAddRecordingScene,
  recordAsScene,
  onAddVoiceover,
  onSetCaptions,
  onSetMusicFromBlob,
  onUpdateWidgetText,
}: {
  openAction: ActionId | null;
  onOpenAction: (next: ActionId) => void;
  onClose: () => void;
} & ActionsPanelProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const recordingMode = recordingModeForAction(openAction);

  const isOpen = openAction !== null;
  const titleKey = titleKeyFor(openAction);
  const descriptionKey = descriptionKeyFor(openAction);
  // Resolve the selected text widget the AI tools should operate against.
  // When nothing useful is selected we fall back to the active scene's
  // first heading or text widget so the user always has SOMETHING to act
  // on — single source of truth so the rewrite / hook handlers agree on
  // the target.
  const editableTextWidget = resolveEditableTextWidget(activeScene, selectedWidget);
  const editableText = editableTextWidget
    ? readWidgetText(editableTextWidget)
    : "";

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className={cn("w-full overflow-y-auto", widthFor(openAction))}>
        <SheetHeader>
          <SheetTitle>{titleKey ? t(titleKey) : ""}</SheetTitle>
          <SheetDescription>{descriptionKey ? t(descriptionKey) : ""}</SheetDescription>
        </SheetHeader>
        <div className="mt-4">
          <Suspense fallback={<div className="py-12 text-center text-sm text-muted-foreground">{t("status.loading")}</div>}>
            {recordingMode && (
              <WebcamRecorderWithUpload
                mode={recordingMode}
                // In-panel source swap: switching re-targets the open
                // sheet; the wrapper remounts the recorder keyed by mode.
                onModeChange={(next) => onOpenAction(RECORDING_MODE_ACTION[next])}
                projectId={persistedProjectId ?? undefined}
                onCaptured={(url, durationSeconds) => {
                  // Armed via Alt+Shift+R / the AI CHRO → the recording
                  // becomes its own full-bleed scene (slide → recording →
                  // slide). Tile path → overlay widget on the active scene.
                  if (recordAsScene && onAddRecordingScene) {
                    onAddRecordingScene(url, durationSeconds);
                    toast({ title: t("studio.actions.toast.recordingAddedAsScene") });
                  } else {
                    onAddVideoWidget(url, durationSeconds);
                    toast({ title: t("studio.actions.toast.clipAdded") });
                  }
                  onClose();
                }}
              />
            )}

            {openAction === "voiceover" && (
              <VoiceoverPanel
                scenes={state.scenes.map((s) => ({
                  id: s.id,
                  text: readSceneText(s),
                }))}
                projectId={persistedProjectId ?? undefined}
                onPublishToScene={(sceneId, audioUrl, durationMs, label) => {
                  onAddVoiceover(
                    makeAudioLayer({
                      kind: "voiceover",
                      source: { kind: "custom", url: audioUrl },
                      label,
                      durationSeconds: durationMs / 1000,
                      anchorSceneId: sceneId,
                    }),
                  );
                  toast({ title: t("studio.actions.toast.voiceoverAdded", { label }) });
                }}
              />
            )}

            {openAction === "ai-headshot" && <HeadshotGenerator />}

            {openAction === "original-music" && (
              <ComposedMusicAction onSetMusicFromBlob={onSetMusicFromBlob} onDone={onClose} />
            )}

            {openAction === "captions" && (
              <CaptionEditorAdapter
                state={state}
                onSetCaptions={onSetCaptions}
              />
            )}

            {openAction === "accessibility" && (
              <StudioAccessibilityPanel state={state} />
            )}

            {openAction === "dubbing" && (
              <StudioDubbingPanel state={state} onAddVoiceover={onAddVoiceover} />
            )}

            {openAction === "ai-rewrite" && (
              <ScriptRewriterDialog
                projectId={persistedProjectId}
                storyboard={{
                  scenes: editableTextWidget
                    ? [{ id: editableTextWidget.id, text: editableText }]
                    : [],
                }}
                onApply={(scenes) => {
                  const next = scenes[0]?.text;
                  if (
                    editableTextWidget &&
                    typeof next === "string" &&
                    next.length > 0
                  ) {
                    onUpdateWidgetText(editableTextWidget.id, next);
                    toast({ title: t("studio.actions.toast.textRewritten") });
                    onClose();
                  } else {
                    toast({
                      title: t("studio.actions.toast.rewriteNothingSelected"),
                      variant: "destructive",
                    });
                  }
                }}
              />
            )}

            {openAction === "ai-hook" && (
              <HookOptimizerDialog
                projectId={persistedProjectId}
                storyboard={{
                  scenes: editableTextWidget
                    ? [{ text: editableText, title: editableText }]
                    : [],
                }}
                onApply={(patch) => {
                  const next = patch.text ?? patch.title;
                  if (
                    editableTextWidget &&
                    typeof next === "string" &&
                    next.length > 0
                  ) {
                    onUpdateWidgetText(editableTextWidget.id, next);
                    toast({ title: t("studio.actions.toast.hookApplied") });
                    onClose();
                  }
                }}
              />
            )}
          </Suspense>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// CaptionEditor adapter — bridges v1's local-state cue/style controls
// to CanvasState. v1 component is mounted untouched.
// ───────────────────────────────────────────────────────────────────────────

function CaptionEditorAdapter({
  state,
  onSetCaptions,
}: {
  state: CanvasState;
  onSetCaptions: (captions: CanvasCaptions) => void;
}) {
  const initial = state.captions;
  const [cues, setCues] = useState<CanvasCaptionCue[]>(initial?.cues ?? []);
  const [style, setStyle] = useState<CanvasCaptions["style"]>(initial?.style ?? "standard");
  const [enabled, setEnabled] = useState<boolean>(initial?.enabled ?? true);

  // Push to parent on every change so the user doesn't need to click
  // "save" — same UX as the rest of the v2 mutators.
  function commit(next: Partial<CanvasCaptions>) {
    const merged: CanvasCaptions = {
      cues: next.cues ?? cues,
      style: next.style ?? style,
      enabled: next.enabled ?? enabled,
    };
    if (next.cues !== undefined) setCues(merged.cues);
    if (next.style !== undefined) setStyle(merged.style);
    if (next.enabled !== undefined) setEnabled(merged.enabled);
    onSetCaptions(merged);
  }

  return (
    <CaptionEditor
      cues={cues}
      onCuesChange={(next) => commit({ cues: next as CanvasCaptionCue[] })}
      style={style}
      onStyleChange={(next) => commit({ style: next as CanvasCaptions["style"] })}
      enabled={enabled}
      onToggle={(next) => commit({ enabled: next })}
    />
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

/** i18n key for the sheet title of each action — pure helper, so it
 *  returns a key (rendered via `t()` by the caller), never a literal. */
function titleKeyFor(id: ActionId | null): string | null {
  switch (id) {
    case "webcam": return "studio.actions.webcamRecording";
    case "screen": return "studio.actions.screenRecording";
    case "screen-pip": return "studio.actions.screenWebcam";
    case "voiceover": return "studio.actions.voiceover";
    case "ai-headshot": return "studio.actions.aiHeadshot";
    case "original-music": return "studio.actions.originalMusic";
    case "captions": return "studio.actions.captions";
    case "accessibility": return "studio.actions.accessibility";
    case "dubbing": return "studio.actions.dubbing";
    case "ai-rewrite": return "studio.actions.aiRewrite";
    case "ai-hook": return "studio.actions.hookOptimizer";
    default: return null;
  }
}

function widthFor(id: ActionId | null): string {
  // AI Headshot is a two-column reference/result layout that's
  // cramped at max-w-3xl. Other actions are single-column and stay
  // at the default.
  if (id === "ai-headshot") return "max-w-5xl sm:max-w-5xl";
  return "max-w-3xl sm:max-w-3xl";
}

/** i18n key for the sheet description of each action (see titleKeyFor). */
function descriptionKeyFor(id: ActionId | null): string | null {
  switch (id) {
    case "webcam":
    case "screen":
    case "screen-pip":
      return "studio.actions.desc.recording";
    case "voiceover":
      return "studio.actions.desc.voiceover";
    case "ai-headshot":
      return "studio.actions.desc.aiHeadshot";
    case "original-music":
      return "studio.actions.desc.originalMusic";
    case "captions":
      return "studio.actions.desc.captions";
    case "accessibility":
      return "studio.actions.desc.accessibility";
    case "dubbing":
      return "studio.actions.desc.dubbing";
    case "ai-rewrite":
      return "studio.actions.desc.aiRewrite";
    case "ai-hook":
      return "studio.actions.desc.aiHook";
    default:
      return null;
  }
}

function resolveEditableTextWidget(scene: Scene, selected: Widget | null): Widget | null {
  if (selected && (selected.params.kind === "text" || selected.params.kind === "heading")) {
    return selected;
  }
  // Prefer a heading on the active scene; fall back to first text widget.
  return (
    scene.widgets.find((w) => w.params.kind === "heading") ??
    scene.widgets.find((w) => w.params.kind === "text") ??
    null
  );
}

function readWidgetText(widget: Widget): string {
  if (widget.params.kind === "text" || widget.params.kind === "heading") {
    return widget.params.data.text;
  }
  return "";
}

function readSceneText(scene: Scene): string {
  return scene.widgets
    .map(readWidgetText)
    .filter((t) => t.length > 0)
    .join("\n")
    .slice(0, 500);
}
