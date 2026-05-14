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
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type {
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
const StockMediaPanel = lazy(() => import("@/components/studio/StockMediaPanel"));
const HeadshotDialog = lazy(() => import("@/components/studio/HeadshotDialog"));
const OriginalMusicComposer = lazy(
  () => import("@/components/studio/OriginalMusicComposer"),
);
const CaptionEditor = lazy(() => import("@/components/studio/CaptionEditor"));
const ScriptRewriterDialog = lazy(
  () => import("@/components/studio/ScriptRewriterDialog"),
);
const HookOptimizerDialog = lazy(
  () => import("@/components/studio/HookOptimizerDialog"),
);
const VoiceoverPanel = lazy(() => import("@/components/studio/VoiceoverPanel"));

type RecordingMode = "webcam" | "screen" | "screen+webcam";

type ActionId =
  | "webcam"
  | "screen"
  | "screen-pip"
  | "voiceover"
  | "stock-media"
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
  onAddVideoWidget: (url: string, durationSeconds: number) => void;
  onAddImageWidget: (url: string) => void;
  onAddVoiceover: (clip: VoiceoverClip) => void;
  onSetCaptions: (captions: CanvasCaptions) => void;
  onSetMusicFromBlob: (blob: Blob, durationSeconds: number, label: string) => void;
  onUpdateWidgetText: (widgetId: string, nextText: string) => void;
}

export default function ActionsPanel(props: ActionsPanelProps) {
  const [openAction, setOpenAction] = useState<ActionId | null>(null);
  const close = useCallback(() => setOpenAction(null), []);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <Section title="Recording & Audio">
        <ActionButton
          label="Webcam"
          icon={Camera}
          onClick={() => setOpenAction("webcam")}
        />
        <ActionButton
          label="Screen"
          icon={TvMinimalPlay}
          onClick={() => setOpenAction("screen")}
        />
        <ActionButton
          label="Screen + PiP"
          icon={TvMinimalPlay}
          onClick={() => setOpenAction("screen-pip")}
        />
        <ActionButton
          label="Voiceover"
          icon={Mic}
          onClick={() => setOpenAction("voiceover")}
        />
        <ActionButton
          label="Original Music"
          icon={Music}
          onClick={() => setOpenAction("original-music")}
        />
      </Section>

      <Section title="Media">
        <ActionButton
          label="Stock Media"
          icon={Search}
          onClick={() => setOpenAction("stock-media")}
        />
        <ActionButton
          label="AI Headshot"
          icon={UserSquare}
          onClick={() => setOpenAction("ai-headshot")}
        />
      </Section>

      <Section title="AI Tools">
        <ActionButton
          label="Rewrite"
          icon={WandSparkles}
          onClick={() => setOpenAction("ai-rewrite")}
        />
        <ActionButton
          label="Hook"
          icon={Sparkles}
          onClick={() => setOpenAction("ai-hook")}
        />
      </Section>

      <Section title="Engagement">
        <ActionButton
          label="Captions"
          icon={Captions}
          onClick={() => setOpenAction("captions")}
        />
        <ActionButton
          label="Chapters"
          icon={ListOrdered}
          onClick={() => {}}
          disabled
          hint="Coming soon — currently in classic editor"
        />
        <ActionButton
          label="Thumbnails"
          icon={ImageIcon}
          onClick={() => {}}
          disabled
          hint="Coming soon — currently in classic editor"
        />
        <ActionButton
          label="Mixer"
          icon={Pencil}
          onClick={() => {}}
          disabled
          hint="Coming soon — currently in classic editor"
        />
      </Section>

      <ActionSheet
        openAction={openAction}
        onClose={close}
        {...props}
      />
    </div>
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
  onAddImageWidget,
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
      <SheetContent side="right" className="w-full max-w-3xl overflow-y-auto sm:max-w-3xl">
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

            {openAction === "stock-media" && (
              <StockMediaPanel
                projectId={persistedProjectId ?? undefined}
                sceneId={activeScene.id}
                onPick={(result) => {
                  if (!result.cdnUrl) {
                    toast({
                      title: "Stock asset has no CDN URL",
                      variant: "destructive",
                    });
                    return;
                  }
                  if (result.mediaType === "video") {
                    onAddVideoWidget(result.cdnUrl, (result.durationMs ?? 0) / 1000);
                  } else {
                    onAddImageWidget(result.cdnUrl);
                  }
                  toast({ title: "Added to canvas" });
                  onClose();
                }}
              />
            )}

            {openAction === "ai-headshot" && <HeadshotDialog />}

            {openAction === "original-music" && (
              <OriginalMusicComposer
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
// Layout primitives
// ───────────────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-border px-3 py-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </section>
  );
}

function ActionButton({
  label,
  icon: Icon,
  onClick,
  disabled = false,
  hint,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      title={hint}
      className={cn(
        "h-auto flex-col gap-1 px-2 py-3 text-xs",
        disabled && "opacity-60",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Button>
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
    case "stock-media": return "Stock Media";
    case "ai-headshot": return "AI Headshot";
    case "original-music": return "Original Music";
    case "captions": return "Captions";
    case "ai-rewrite": return "AI Rewrite";
    case "ai-hook": return "Hook Optimizer";
    default: return "";
  }
}

function descriptionFor(id: ActionId | null): string {
  switch (id) {
    case "webcam":
    case "screen":
    case "screen-pip":
      return "Record a clip — it lands on the active scene as a video widget when you finish.";
    case "voiceover":
      return "Generate or record narration; choose which scene it anchors to.";
    case "stock-media":
      return "Search free stock images + video. Picking drops the asset onto the canvas.";
    case "ai-headshot":
      return "Generate a professional headshot. Download or drop on the canvas.";
    case "original-music":
      return "Compose original music. The result replaces the current music track.";
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
