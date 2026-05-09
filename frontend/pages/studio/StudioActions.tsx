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

import { useState, lazy, Suspense } from "react";
import {
  Sparkles, Wand2, Mic, Video as VideoIcon, Subtitles, ListOrdered,
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
import type { VideoScript } from "@/types/video-script";

// Lazy-load heavy panels for the inline enhancements
const VoiceoverPanel = lazy(() => import("@/components/studio/VoiceoverPanel"));
const WebcamRecorder = lazy(() => import("@/components/studio/WebcamRecorder").then((m) => ({ default: m.WebcamRecorder })));
const CaptionEditor = lazy(() => import("@/components/studio/CaptionEditor"));
const VoiceCloneManager = lazy(() => import("@/components/studio/VoiceCloneManager"));
const OriginalMusicComposer = lazy(() => import("@/components/studio/OriginalMusicComposer"));

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

  // When the Original Music composer renders a WAV, attach it to the
  // project's video.audio as a "custom" track so the existing music
  // lane (gain / fade / mute via AudioMixerDialog) controls it.
  // Stores a Blob URL — fine for the editing session; promoting to a
  // hosted upload happens at publish time (gap #458).
  const handleMusicReady = (blob: Blob, _durationSec: number) => {
    if (!script) return;
    const trackUrl = URL.createObjectURL(blob);
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

      {/* Recording & Audio */}
      <Section title="Recording & Audio" icon={Mic}>
        <button
          type="button"
          className="px-3 h-8 rounded-md border border-border text-xs font-medium hover:bg-accent transition-colors flex items-center gap-1.5"
          onClick={() => setOpenPanel(openPanel === "record" ? null : "record")}
        >
          <VideoIcon className="h-3.5 w-3.5" /> Record
        </button>
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
          title="Compose a quick original music bed (step sequencer → WAV)"
        >
          <Music className="h-3.5 w-3.5" /> Original Music
        </button>
      </Section>

      {openPanel === "record" && (
        <ActionPanel title="Webcam Recording">
          <Suspense fallback={<div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading recorder…</div>}>
            <WebcamRecorder
              onRecordingComplete={(blob) => setRecordedBlob(blob)}
              teleprompterText={scriptText ?? ""}
              mode="webcam"
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
            <OriginalMusicComposer onMusicReady={handleMusicReady} />
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
