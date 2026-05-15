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
import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import {
  Camera,
  Captions,
  Image as ImageIcon,
  ListOrdered,
  Mic,
  Music,
  Pencil,
  Search,
  Sparkles,
  TvMinimalPlay,
  UserSquare,
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
import MediaPicker from "@/components/shared/MediaPicker";
import { useCollapsibleSections } from "@/lib/hooks/useCollapsibleSections";
import type {
  CanvasAudioMix,
  CanvasCaptions,
  CanvasCaptionCue,
  CanvasState,
  Scene,
  VoiceoverClip,
  Widget,
} from "@/lib/studio/editor-v2/canvas-state";

// Lazy-load every dialog so the editor's initial bundle doesn't pull
// MediaRecorder / Web Audio / camera permissions when the user just
// wants to drag a text widget. Each Suspense fallback keeps the sheet
// open so click-to-open feels instant.
const WebcamRecorder = lazy(() =>
  import("@/components/studio/WebcamRecorder").then((m) => ({
    default: m.WebcamRecorder,
  })),
);
const HeadshotGenerator = lazy(() => import("@/components/studio/HeadshotGenerator"));
// MusicComposer is the shared "Step Sequencer / Piano" tab host — surfaces
// the playable piano (PianoComposer) alongside the grid sequencer
// (OriginalMusicComposer) so both production paradigms land on the canvas
// through the same `onMusicReady` callback.
const MusicComposer = lazy(
  () => import("@/components/studio/music/MusicComposer"),
);
const CaptionEditor = lazy(() => import("@/components/studio/CaptionEditor"));
const ScriptRewriterDialog = lazy(
  () => import("@/components/studio/ScriptRewriterDialog"),
);
const HookOptimizerDialog = lazy(
  () => import("@/components/studio/HookOptimizerDialog"),
);
const VoiceoverPanel = lazy(() => import("@/components/studio/VoiceoverPanel"));
const V2AdvisoryDialogs = lazy(() => import("./V2AdvisoryDialogs"));
const ChapterEditor = lazy(() => import("@/components/studio/ChapterEditor"));
const ThumbnailsDialog = lazy(() => import("@/components/studio/ThumbnailsDialog"));
const AudioMixerV2 = lazy(() => import("./AudioMixerV2"));

type RecordingMode = "webcam" | "screen" | "screen+webcam";

type ActionId =
  | "webcam"
  | "screen"
  | "screen-pip"
  | "voiceover"
  | "ai-headshot"
  | "original-music"
  | "captions"
  | "ai-rewrite"
  | "ai-hook";

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
  onAddVoiceover: (clip: VoiceoverClip) => void;
  onSetCaptions: (captions: CanvasCaptions) => void;
  onSetMusicFromBlob: (blob: Blob, durationSeconds: number, label: string) => void;
  onUpdateWidgetText: (widgetId: string, nextText: string) => void;
  /** Adapter for the Version History advisory dialog — host converts
   *  the restored v1 script via `scriptToCanvasState` and applies it. */
  onRestoreCanvas?: (next: CanvasState) => void;
  /** Patch the canvas-level audio mix (master / lane gains + mutes).
   *  Required when the Engagement section's audio-mixer trigger is
   *  visible — the mixer can't compose without a way to mutate state. */
  onPatchAudioMix?: (patch: Partial<CanvasAudioMix>) => void;
  /** Patch one voiceover clip's per-clip gain / muted. */
  onPatchVoiceover?: (clipId: string, patch: Partial<Pick<VoiceoverClip, "gain" | "muted">>) => void;
  /** When set, the panel auto-opens this action on mount. Drives the
   *  `?capture=screen|webcam|screen+webcam` deep-link from chrome
   *  extensions and "Record promo" CTAs (#651) — caller maps the URL
   *  param to the matching ActionId. Fires only once per panel mount;
   *  subsequent changes are ignored so a user closing the sheet doesn't
   *  re-trigger it. */
  defaultOpenAction?: ActionId;
}

const SECTION_IDS = ["recording", "media", "ai", "engagement", "advisory"] as const;
type SectionId = (typeof SECTION_IDS)[number];

export default function ActionsPanel(props: ActionsPanelProps) {
  const [openAction, setOpenAction] = useState<ActionId | null>(
    props.defaultOpenAction ?? null,
  );
  const close = useCallback(() => setOpenAction(null), []);
  // Shared multi-open accordion state — every left-rail panel uses the
  // SAME hook so the open/close UX is identical across Widgets / Design
  // / Actions tabs.
  const sections = useCollapsibleSections<SectionId>(SECTION_IDS, {
    storageKey: "studio.v2.left.actions.sections",
  });

  return (
    <LeftPanelScroller>
      <LeftPanelSection
        title="Recording & Audio"
        open={sections.isOpen("recording")}
        onToggle={() => sections.toggle("recording")}
        contentClassName="grid grid-cols-2 gap-2"
      >
        <LeftPanelTile
          label="Webcam"
          icon={Camera}
          onClick={() => setOpenAction("webcam")}
        />
        <LeftPanelTile
          label="Screen"
          icon={TvMinimalPlay}
          onClick={() => setOpenAction("screen")}
        />
        <LeftPanelTile
          label="Screen + PiP"
          icon={TvMinimalPlay}
          onClick={() => setOpenAction("screen-pip")}
        />
        <LeftPanelTile
          label="Voiceover"
          icon={Mic}
          onClick={() => setOpenAction("voiceover")}
        />
        <LeftPanelTile
          label="Original Music"
          icon={Music}
          onClick={() => setOpenAction("original-music")}
        />
      </LeftPanelSection>

      <LeftPanelSection
        title="Media"
        open={sections.isOpen("media")}
        onToggle={() => sections.toggle("media")}
        contentClassName="grid grid-cols-2 gap-2"
      >
        {/* MediaPicker is the SAME unified dialog v1 mounts elsewhere
            in the app (StudioSidebar, profile editor, job editor, etc).
            It owns the Upload / Stock / AI-image tabs, so we don't need
            three separate buttons here. Result is dropped onto the
            active scene as an Image or Video widget — caller doesn't
            care which tab the user picked from. */}
        <MediaPicker
          accept="image+video"
          title="Add media to canvas"
          onPick={(asset) => {
            if (asset.mediaType === "video") {
              // PickedMedia doesn't carry duration; widget defaults to
              // 0 and the scene stays at its existing length.
              props.onAddVideoWidget(asset.url, 0);
            } else {
              props.onAddImageWidget(asset.url);
            }
          }}
          trigger={
            <LeftPanelTile
              label="Media"
              icon={Search}
              onClick={() => {
                /* MediaPicker opens itself via DialogTrigger asChild. */
              }}
            />
          }
        />
        <LeftPanelTile
          label="AI Headshot"
          icon={UserSquare}
          onClick={() => setOpenAction("ai-headshot")}
        />
      </LeftPanelSection>

      <LeftPanelSection
        title="AI Tools"
        open={sections.isOpen("ai")}
        onToggle={() => sections.toggle("ai")}
        contentClassName="grid grid-cols-2 gap-2"
      >
        <LeftPanelTile
          label="Rewrite"
          icon={WandSparkles}
          onClick={() => setOpenAction("ai-rewrite")}
        />
        <LeftPanelTile
          label="Hook"
          icon={Sparkles}
          onClick={() => setOpenAction("ai-hook")}
        />
      </LeftPanelSection>

      <LeftPanelSection
        title="Engagement"
        open={sections.isOpen("engagement")}
        onToggle={() => sections.toggle("engagement")}
        contentClassName="grid gap-2"
      >
        <LeftPanelTile
          label="Captions"
          icon={Captions}
          onClick={() => setOpenAction("captions")}
        />
        {/* Chapters + Thumbnails take primitive props (projectId, video
            metadata) — they mount cleanly in v2 once a project has
            been persisted. Each renders its own trigger button (#614). */}
        {props.persistedProjectId && (
          <Suspense fallback={null}>
            <ChapterEditor
              projectId={props.persistedProjectId}
              sceneBoundaries={props.state.scenes.map((s, idx) => ({
                title: s.label,
                start: props.state.scenes
                  .slice(0, idx)
                  .reduce((sum, prev) => sum + prev.durationSeconds, 0),
              }))}
            />
            <ThumbnailsDialog
              projectId={props.persistedProjectId}
              videoUrl={props.videoId ?? null}
              durationSec={props.state.scenes.reduce(
                (sum, s) => sum + s.durationSeconds,
                0,
              )}
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
        title="Advisory & Lifecycle"
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
            onRestoreCanvasFromScript={(next) => props.onRestoreCanvas?.(next)}
          />
        </Suspense>
      </LeftPanelSection>

      <ActionSheet
        openAction={openAction}
        onClose={close}
        {...props}
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
  onClose,
  state,
  activeScene,
  selectedWidget,
  persistedProjectId,
  onAddVideoWidget,
  onAddVoiceover,
  onSetCaptions,
  onSetMusicFromBlob,
  onUpdateWidgetText,
}: { openAction: ActionId | null; onClose: () => void } & ActionsPanelProps) {
  const { toast } = useToast();
  const recordingMode = useMemo<RecordingMode | null>(() => {
    if (openAction === "webcam") return "webcam";
    if (openAction === "screen") return "screen";
    if (openAction === "screen-pip") return "screen+webcam";
    return null;
  }, [openAction]);

  const isOpen = openAction !== null;
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
          <SheetTitle>{titleFor(openAction)}</SheetTitle>
          <SheetDescription>{descriptionFor(openAction)}</SheetDescription>
        </SheetHeader>
        <div className="mt-4">
          <Suspense fallback={<div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>}>
            {recordingMode && (
              <WebcamRecorder
                mode={recordingMode}
                onRecordingComplete={(blob, durationMs) => {
                  const url = URL.createObjectURL(blob);
                  onAddVideoWidget(url, durationMs / 1000);
                  toast({ title: "Clip added to canvas" });
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
                  onAddVoiceover({
                    id: `vo_${Math.random().toString(36).slice(2, 10)}`,
                    url: audioUrl,
                    durationSeconds: durationMs / 1000,
                    anchorSceneId: sceneId,
                    label,
                  });
                  toast({ title: `Voiceover added: ${label}` });
                }}
              />
            )}

            {openAction === "ai-headshot" && <HeadshotGenerator />}

            {openAction === "original-music" && (
              <MusicComposer
                onMusicReady={(blob, durationSec) => {
                  onSetMusicFromBlob(blob, durationSec, "Original composition");
                  toast({ title: "Music added to composition" });
                  onClose();
                }}
              />
            )}

            {openAction === "captions" && (
              <CaptionEditorAdapter
                state={state}
                onSetCaptions={onSetCaptions}
              />
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
                    toast({ title: "Text rewritten" });
                    onClose();
                  } else {
                    toast({
                      title: "Couldn't apply rewrite — nothing selected",
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
                    toast({ title: "Hook applied" });
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

function titleFor(id: ActionId | null): string {
  switch (id) {
    case "webcam": return "Webcam Recording";
    case "screen": return "Screen Recording";
    case "screen-pip": return "Screen + Webcam";
    case "voiceover": return "Voiceover";
    case "ai-headshot": return "AI Headshot";
    case "original-music": return "Original Music";
    case "captions": return "Captions";
    case "ai-rewrite": return "AI Rewrite";
    case "ai-hook": return "Hook Optimizer";
    default: return "";
  }
}

function widthFor(id: ActionId | null): string {
  // AI Headshot is a two-column reference/result layout that's
  // cramped at max-w-3xl. Other actions are single-column and stay
  // at the default.
  if (id === "ai-headshot") return "max-w-5xl sm:max-w-5xl";
  return "max-w-3xl sm:max-w-3xl";
}

function descriptionFor(id: ActionId | null): string {
  switch (id) {
    case "webcam":
    case "screen":
    case "screen-pip":
      return "Record a clip — it lands on the active scene as a video widget when you finish.";
    case "voiceover":
      return "Generate or record narration; choose which scene it anchors to.";
    case "ai-headshot":
      return "Generate a professional headshot. Download or drop on the canvas.";
    case "original-music":
      return "Compose original music — step sequencer OR live piano. The result replaces the current music track.";
    case "captions":
      return "Author captions for the composition.";
    case "ai-rewrite":
      return "Rewrite the selected text widget with AI.";
    case "ai-hook":
      return "Optimise your opening hook for retention.";
    default:
      return "";
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
