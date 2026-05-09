// StudioActions.tsx — Actions tab content for the studio editor.
//
// Houses all gap-closing tools and advanced enhancements, organised into
// sections so users can find features without hunting through a toolbar.
//
// Sections:
//   • AI Tools             — Rewrite, Hook Optimizer
//   • Recording & Audio    — Record, Voiceover, Audio Mixer, Original Music
//   • Captions & Chapters  — Captions, Chapters
//   • Engagement           — Forms, Reviews, Thumbnails

import { useState, useEffect, lazy, Suspense } from "react";
import {
  Sparkles, Wand2, Mic, Subtitles, ListOrdered,
  Sliders, FileText, MessageSquare, Image as ImageIcon, Loader2,
  Music,
} from "lucide-react";
import ChapterEditor from "@/components/studio/ChapterEditor";
import ScriptRewriterDialog from "@/components/studio/ScriptRewriterDialog";
import HookOptimizerDialog from "@/components/studio/HookOptimizerDialog";
import AudioMixerDialog from "@/components/studio/AudioMixerDialog";
import VideoFormsDialog from "@/components/studio/VideoFormsDialog";
import ReviewCommentsDialog from "@/components/studio/ReviewCommentsDialog";
import ThumbnailsDialog from "@/components/studio/ThumbnailsDialog";
import HeadshotDialog from "@/components/studio/HeadshotDialog";
import { RecordingModeButtons } from "@/components/studio/RecordingModeButtons";
import { RECORDING_MODES, type RecordingMode } from "@/components/studio/WebcamRecorder";
import { studioService } from "@/lib/services/studio-service";
import { useToast } from "@/hooks/use-toast";
import type { VideoScript } from "@/types/video-script";

// Lazy-load heavy panels for the inline enhancements
const VoiceoverPanel = lazy(() => import("@/components/studio/VoiceoverPanel"));
const WebcamRecorder = lazy(() => import("@/components/studio/WebcamRecorder").then((m) => ({ default: m.WebcamRecorder })));
const CaptionEditor = lazy(() => import("@/components/studio/CaptionEditor"));
const VoiceCloneManager = lazy(() => import("@/components/studio/VoiceCloneManager"));
const MusicComposer = lazy(() => import("@/components/studio/music/MusicComposer"));

interface VoiceoverResult {
  sceneId: string;
  audioUrl: string | null;
  durationMs: number;
  wordTimestamps: Array<{ word: string; start: number; end: number }>;
}

interface Props {
  projectId: string | null;
  script: VideoScript | null;
  onScriptChange: (s: VideoScript) => void;
  sceneBoundaries?: Array<{ start: number; title: string }>;
  videoUrl?: string | null;
  durationSec?: number;
  currentTimeSec?: number;
  scenes?: Array<{ id: string; title?: string; text?: string; items?: string[]; skills?: string[] }>;
  scriptText?: string;
  onApplyRewrite: (scenes: Array<Record<string, unknown>>) => void;
  onApplyHook: (sceneZeroPatch: { title?: string; subtitle?: string; text?: string }) => void;
  onVoiceoverGenerated?: (results: VoiceoverResult[]) => void;
  onVoiceConfigChange?: (config: {
    engine: "web-speech" | "kokoro" | "piper" | "vibevoice";
    voiceId: string;
    voiceName: string;
    speed: number;
  }) => void;
  /** Recorder auto-arm intent — combined output of URL `?capture=`
   *  and active template's `defaultRecordingMode` (resolved upstream
   *  in StudioLayout). When set, this component opens the Recording
   *  panel on mount and passes `autoStart` + the mode straight to
   *  WebcamRecorder. Null = no auto-arm; user opens the panel
   *  manually via the Recording & Audio mode buttons. */
  defaultRecordingMode?: RecordingMode | null;
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        <Icon className="h-3 w-3" /> {title}
      </h3>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

function ActionPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <h4 className="text-xs font-semibold">{title}</h4>
      {children}
    </div>
  );
}

export default function StudioActions({
  projectId,
  script,
  onScriptChange,
  sceneBoundaries,
  videoUrl,
  durationSec,
  currentTimeSec,
  scenes,
  scriptText,
  onApplyRewrite,
  onApplyHook,
  onVoiceoverGenerated,
  onVoiceConfigChange,
  defaultRecordingMode,
}: Props) {
  // Edit a scene's narration text in place via the existing onScriptChange flow.
  const handleSceneTextChange = (sceneId: string, text: string) => {
    if (!script) return;
    onScriptChange({
      ...script,
      scenes: script.scenes.map((s) =>
        s.id === sceneId ? { ...s, text } : s,
      ),
    } as VideoScript);
  };

  // Attach a published voiceover (already uploaded as a hosted wav) to a
  // scene as an audio media element. The element lives in scene.sceneElements
  // alongside images/text/chips, so users see + manage it from the unified
  // gallery in the storyboard editor.
  const handlePublishVoiceoverToScene = (
    sceneId: string,
    audioUrl: string,
    _durationMs: number,
    label: string,
  ) => {
    if (!script) return;
    const audioEl = {
      id: `el-vo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      kind: "audio" as const,
      url: audioUrl,
      label,
      volume: 1,
      box: { x: 0, y: 0, w: 0, h: 0 },
    };
    onScriptChange({
      ...script,
      scenes: script.scenes.map((s) => {
        if (s.id !== sceneId) return s;
        // Replace any prior voiceover audio element on this scene rather than
        // stacking them — the user expects "publish" to update, not append.
        const existing = (s.sceneElements ?? []).filter(
          (e) => !(e.kind === "audio" && e.label?.startsWith("Voiceover")),
        );
        return { ...s, sceneElements: [...existing, audioEl] };
      }),
    } as VideoScript);
  };
  // Inline enhancement state
  const [openPanel, setOpenPanel] = useState<"record" | "voiceover" | "captions" | "music" | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  // Recording mode the WebcamRecorder mounts in. Defaults to "webcam"
  // — only matters until the user picks a mode (each section button
  // sets it explicitly + opens the panel). When the upstream
  // `defaultRecordingMode` signal fires (URL `?capture=` or template
  // `defaultRecordingMode`), we set this AND open the panel — both
  // signals route through the same auto-arm effect below.
  const [recordingMode, setRecordingMode] = useState<RecordingMode>("webcam");
  // True when the Recording panel was auto-opened by upstream intent
  // (template / URL). Drives `autoStart` on the WebcamRecorder so the
  // user lands already in the camera/screen permission prompt without
  // hunting for "Start Camera". Stays true for the lifetime of the
  // open panel so a remount on mode change keeps auto-starting.
  const [recorderAutoStart, setRecorderAutoStart] = useState(false);

  // Single auto-arm effect — fires once when an intent arrives.
  useEffect(() => {
    if (!defaultRecordingMode) return;
    setRecordingMode(defaultRecordingMode);
    setRecorderAutoStart(true);
    setOpenPanel("record");
  }, [defaultRecordingMode]);

  const { toast } = useToast();

  // When the Original Music composer renders a WAV, upload it to R2
  // (same path the Voiceover panel uses) and attach the hosted URL
  // to script.video.audio.track so reloading the project keeps the
  // music. Falls back to a Blob URL if the upload fails — the user
  // still hears their music in this session, plus a toast nudges
  // them to retry/save.
  const handleMusicReady = async (blob: Blob, _durationSec: number) => {
    if (!script) return;
    let trackUrl: string;
    try {
      const file = new File(
        [blob],
        `original-music-${Date.now()}.wav`,
        { type: "audio/wav" },
      );
      const res = await studioService.uploadSceneAudio(file);
      trackUrl = res.data.url;
    } catch (err) {
      toast({
        title: "Music upload failed",
        description: "Saved as a session-only Blob URL — re-render and accept again to retry the upload.",
        variant: "destructive",
      });
      trackUrl = URL.createObjectURL(blob);
    }
    onScriptChange({
      ...script,
      video: {
        ...script.video,
        audio: {
          ...(script.video?.audio ?? { volume: 0.6 }),
          track: trackUrl,
          label: "Original (composed)",
        },
      },
    } as VideoScript);
  };
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [captionStyle, setCaptionStyle] = useState<"standard" | "bold-pop" | "word-by-word" | "lower-thirds">("standard");

  return (
    <div className="p-5 space-y-6 overflow-y-auto h-full">
      {/* AI Tools */}
      <Section title="AI Tools" icon={Sparkles}>
        <ScriptRewriterDialog projectId={projectId} storyboard={script} onApply={onApplyRewrite} />
        <HookOptimizerDialog projectId={projectId} storyboard={script} onApply={onApplyHook} />
      </Section>

      {/* Recording & Audio — every template gets the full set of
          recording sources here. The three RecordingModeButtons each
          open the panel pre-armed (autoStart=true) so a single click
          jumps straight to the browser's source-pick prompt. */}
      <Section title="Recording & Audio" icon={Mic}>
        <RecordingModeButtons
          current={openPanel === "record" ? recordingMode : null}
          onPick={(m) => {
            // Re-clicking the active mode collapses the panel —
            // matches the toggle behaviour of the other section
            // buttons (Voiceover, Original Music) below.
            if (openPanel === "record" && recordingMode === m) {
              setOpenPanel(null);
              return;
            }
            setRecordingMode(m);
            setRecorderAutoStart(true);
            setOpenPanel("record");
          }}
        />
        <button
          type="button"
          className="px-3 h-8 rounded-md border border-border text-xs font-medium hover:bg-accent transition-colors flex items-center gap-1.5"
          onClick={() => setOpenPanel(openPanel === "voiceover" ? null : "voiceover")}
        >
          <Mic className="h-3.5 w-3.5" /> Voiceover
        </button>
        <AudioMixerDialog script={script} onScriptChange={onScriptChange} />
        <button
          type="button"
          className="px-3 h-8 rounded-md border border-border text-xs font-medium hover:bg-accent transition-colors flex items-center gap-1.5"
          onClick={() => setOpenPanel(openPanel === "music" ? null : "music")}
          title="Compose a quick original music bed (step sequencer or piano → WAV)"
        >
          <Music className="h-3.5 w-3.5" /> Original Music
        </button>
      </Section>

      {openPanel === "record" && (
        <ActionPanel title={RECORDING_MODES.find((m) => m.id === recordingMode)?.panelTitle ?? "Recording"}>
          <Suspense fallback={<div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading recorder…</div>}>
            {/* Mid-session mode swap — same chooser, smaller chips.
                Switching by hand clears autoStart since the user is
                now driving. */}
            <div className="flex items-center gap-1">
              <RecordingModeButtons
                size="sm"
                current={recordingMode}
                onPick={(m) => {
                  setRecordingMode(m);
                  setRecorderAutoStart(false);
                }}
              />
            </div>
            {/* `key` forces a remount when mode changes, since
                WebcamRecorder reads `mode` only at startPreview() time. */}
            <WebcamRecorder
              key={`recorder-${recordingMode}`}
              onRecordingComplete={(blob) => setRecordedBlob(blob)}
              teleprompterText={scriptText ?? ""}
              mode={recordingMode}
              autoStart={recorderAutoStart}
            />
            {recordedBlob && (
              <p className="text-[11px] text-muted-foreground">Recording captured — {(recordedBlob.size / 1024).toFixed(0)} KB</p>
            )}
          </Suspense>
        </ActionPanel>
      )}

      {openPanel === "voiceover" && scenes && (
        <ActionPanel title="AI Voiceover">
          <Suspense fallback={<div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading voiceover…</div>}>
            <VoiceCloneManager onVoiceSelected={() => {}} />
            <VoiceoverPanel
              scenes={scenes}
              projectId={projectId ?? undefined}
              onVoiceoverGenerated={(results) => onVoiceoverGenerated?.(results)}
              onVoiceConfigChange={onVoiceConfigChange}
              onSceneTextChange={handleSceneTextChange}
              onPublishToScene={handlePublishVoiceoverToScene}
            />
          </Suspense>
        </ActionPanel>
      )}

      {openPanel === "music" && (
        <ActionPanel title="Original Music">
          <Suspense fallback={<div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading composer…</div>}>
            <MusicComposer onMusicReady={handleMusicReady} />
          </Suspense>
        </ActionPanel>
      )}

      {/* Captions & Chapters */}
      <Section title="Captions & Chapters" icon={Subtitles}>
        <button
          type="button"
          className="px-3 h-8 rounded-md border border-border text-xs font-medium hover:bg-accent transition-colors flex items-center gap-1.5"
          onClick={() => setOpenPanel(openPanel === "captions" ? null : "captions")}
        >
          <Subtitles className="h-3.5 w-3.5" /> Captions
        </button>
        <ChapterEditor projectId={projectId} sceneBoundaries={sceneBoundaries} />
      </Section>

      {openPanel === "captions" && (
        <ActionPanel title="Auto Captions">
          <Suspense fallback={<div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading captions…</div>}>
            <CaptionEditor
              cues={[]}
              style={captionStyle}
              onStyleChange={(s) => setCaptionStyle(s as typeof captionStyle)}
              enabled={captionsEnabled}
              onToggle={() => setCaptionsEnabled((v) => !v)}
            />
          </Suspense>
        </ActionPanel>
      )}

      {/* Engagement */}
      <Section title="Engagement" icon={MessageSquare}>
        <VideoFormsDialog projectId={projectId} />
        <ReviewCommentsDialog projectId={projectId} currentTimeSec={currentTimeSec} />
        <ThumbnailsDialog projectId={projectId} videoUrl={videoUrl ?? null} durationSec={durationSec} />
        <HeadshotDialog />
      </Section>
    </div>
  );
}
