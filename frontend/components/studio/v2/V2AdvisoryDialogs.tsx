/**
 * V2AdvisoryDialogs — mounts the v1 advisory / lifecycle dialogs in
 * the v2 editor so creators don't need to bounce to v1 to access
 * version history, review comments, analytics, ATS export, async
 * interview practice, or skills-demo capture (gap #612).
 *
 * Per the DRY rule: every dialog rendered here is the v1 component,
 * untouched. The v2 ↔ v1 boundary lives in adapter callbacks —
 * Version History restores into a CanvasState via
 * `scriptToCanvasState`, ATS gets the script via
 * `canvasStateToScript`, etc.
 *
 * Self-gating: returns null when no project has been persisted yet —
 * every dialog here needs a `projectId` to operate. Each individual
 * dialog mounts a `<DialogTrigger>` button visually so the consumer
 * just drops `<V2AdvisoryDialogs />` and the buttons appear.
 */
import { lazy, Suspense, useMemo, useState } from "react";
import {
  BarChart3,
  FileText,
  Gauge,
  Loader2,
  MessageSquare,
  Mic,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { canvasStateToScript } from "@/lib/studio/editor-v2/canvas-to-script";
import { canvasStateToText } from "@/lib/studio/editor-v2/canvas-to-text";
import { scriptToCanvasState } from "@/lib/studio/editor-v2/script-to-canvas";
import type { CanvasState } from "@/lib/studio/editor-v2/canvas-state";
import type { VideoScript } from "@/types/video-script";
import {
  analyzeDelivery,
  transcribeRecording,
  uploadRecording,
  type DeliveryCoachingResult,
} from "@/lib/services/studio-features-service";

const VersionHistoryDialog = lazy(
  () => import("@/components/studio/VersionHistoryDialog"),
);
const ReviewCommentsDialog = lazy(
  () => import("@/components/studio/ReviewCommentsDialog"),
);
const VideoAnalyticsDashboard = lazy(
  () => import("@/components/studio/VideoAnalyticsDashboard"),
);
const ATSPackageGenerator = lazy(
  () => import("@/components/studio/ATSPackageGenerator"),
);
const AsyncInterviewManager = lazy(
  () => import("@/components/studio/AsyncInterviewManager"),
);
const SkillsDemoCreator = lazy(
  () => import("@/components/studio/SkillsDemoCreator"),
);
const DeliveryCoach = lazy(
  () => import("@/components/studio/DeliveryCoach"),
);

interface Props {
  projectId: string | null;
  /** Server-side videoId for the rendered MP4 (when published). When
   *  null the Analytics dialog renders empty-state copy — same v1
   *  behaviour. */
  videoId?: string | null;
  /** Live canvas state — used by adapters: Version History snapshots
   *  the projected script; ATS extracts script text. */
  state: CanvasState;
  /** Adapter callback used by Version History to apply a restored
   *  script. The host converts via `scriptToCanvasState` and resets
   *  the editor's history. */
  onRestoreCanvasFromScript: (next: CanvasState) => void;
}

export default function V2AdvisoryDialogs({
  projectId,
  videoId,
  state,
  onRestoreCanvasFromScript,
}: Props) {
  // Every dialog here needs a project id — there's nothing to operate
  // on without one. Self-gate so the consumer doesn't need a
  // `canShowAdvisoryTools` prop.
  if (!projectId) return null;

  return (
    <div className="grid grid-cols-2 gap-2">
      <VersionHistoryTrigger
        projectId={projectId}
        state={state}
        onRestoreCanvasFromScript={onRestoreCanvasFromScript}
      />
      <ReviewCommentsTrigger projectId={projectId} />
      <AnalyticsTrigger projectId={projectId} />
      <ATSTrigger projectId={projectId} state={state} videoId={videoId ?? null} />
      <AsyncInterviewTrigger />
      <SkillsDemoTrigger state={state} />
      <DeliveryCoachTrigger projectId={projectId} state={state} />
    </div>
  );
}

// ── Version History — restore writes back into the V2 canvas ────────────

function VersionHistoryTrigger({
  projectId,
  state,
  onRestoreCanvasFromScript,
}: {
  projectId: string;
  state: CanvasState;
  onRestoreCanvasFromScript: (next: CanvasState) => void;
}) {
  // The v1 dialog renders its own trigger button; we just have to
  // hand it the storyboard the user is currently editing + the
  // restore adapter.
  return (
    <Suspense fallback={null}>
      <VersionHistoryDialog
        projectId={projectId}
        currentStoryboard={canvasStateToScript(state)}
        onRestore={(storyboard) => {
          // Convert the restored v1 script back into a CanvasState
          // and apply it. The lossless migration paths (#611) carry
          // every v1 field across so restored versions don't lose
          // chips / scene-type / per-scene effects.
          const next = scriptToCanvasState(storyboard as VideoScript);
          onRestoreCanvasFromScript(next);
        }}
      />
    </Suspense>
  );
}

function ReviewCommentsTrigger({ projectId }: { projectId: string }) {
  // Dialog manages its own trigger + open state internally.
  return (
    <Suspense fallback={null}>
      <ReviewCommentsDialog projectId={projectId} />
    </Suspense>
  );
}

// ── Analytics — full-page component wrapped in a Dialog ────────────────

function AnalyticsTrigger({ projectId }: { projectId: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 justify-start px-2 text-xs">
          <BarChart3 className="mr-1.5 h-3.5 w-3.5" />
          Analytics
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Video Analytics</DialogTitle>
          <DialogDescription>
            Views, watch-through, CTA clicks. Empty until the project has
            accumulated viewer activity.
          </DialogDescription>
        </DialogHeader>
        {projectId ? (
          <Suspense fallback={null}>
            <VideoAnalyticsDashboard projectId={projectId} />
          </Suspense>
        ) : (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Render and publish the video first — analytics begin recording
            once viewers start watching.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── ATS Package — extracts scriptText via canvasStateToScript ──────────

function ATSTrigger({
  projectId,
  state,
  videoId,
}: {
  projectId: string;
  state: CanvasState;
  videoId: string | null;
}) {
  const [open, setOpen] = useState(false);
  // Project script in plain-text form. `canvasStateToText` is the
  // shared extractor — used here AND by the Skills Demo trigger
  // below, so the two surfaces stay in lockstep on what counts as
  // "what the video says" (DRY).
  function buildScriptText(): string {
    return canvasStateToText(state);
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 justify-start px-2 text-xs">
          <FileText className="mr-1.5 h-3.5 w-3.5" />
          ATS export
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>ATS Package</DialogTitle>
          <DialogDescription>
            Generate an ATS-friendly bundle (transcript, captions,
            chapters) for recruiters who can't watch video.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <Suspense fallback={null}>
            <ATSPackageGenerator
              projectId={projectId}
              scriptText={buildScriptText()}
              videoUrl={videoId ?? undefined}
            />
          </Suspense>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Async Interview — recruiter / candidate practice tool ──────────────

function AsyncInterviewTrigger() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 justify-start px-2 text-xs">
          <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
          Practice interview
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Async Interview Practice</DialogTitle>
          <DialogDescription>
            Record and review interview answers without leaving the editor.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <Suspense fallback={null}>
            <AsyncInterviewManager isRecruiter={false} />
          </Suspense>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Skills Demo — capture a skills demonstration ──────────────────────

function SkillsDemoTrigger({ state }: { state: CanvasState }) {
  const [open, setOpen] = useState(false);
  // Reuse the canvas's concatenated text as an approximate resume
  // body — same shared extractor the ATS trigger uses (DRY).
  const resumeText = canvasStateToText(state);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 justify-start px-2 text-xs">
          <Mic className="mr-1.5 h-3.5 w-3.5" />
          Skills demo
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Skills Demo</DialogTitle>
          <DialogDescription>
            Capture a quick demo of a specific skill — extracted from the
            current scene's body text as a starting point.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <Suspense fallback={null}>
            <SkillsDemoCreator resumeText={resumeText} />
          </Suspense>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Delivery Coach — on-demand analysis of a captured webcam clip ─────

function DeliveryCoachTrigger({
  projectId,
  state,
}: {
  projectId: string;
  state: CanvasState;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<DeliveryCoachingResult | null>(null);

  // Find every webcam-widget URL in the canvas so the user can pick one
  // to analyse. Voiceover clips with audio URLs are also fair game.
  const candidates = useMemo(() => {
    const out: Array<{ id: string; label: string; url: string; kind: "webcam" | "voiceover" }> = [];
    for (const scene of state.scenes) {
      for (const w of scene.widgets) {
        if (w.params.kind === "webcam" && w.params.data.recordingUrl) {
          out.push({
            id: w.id,
            label: `${scene.label}: webcam`,
            url: w.params.data.recordingUrl,
            kind: "webcam",
          });
        }
      }
    }
    for (const vo of state.voiceovers) {
      if (vo.url) {
        out.push({ id: vo.id, label: vo.label, url: vo.url, kind: "voiceover" });
      }
    }
    return out;
  }, [state]);

  async function runAnalysis(url: string) {
    setIsAnalyzing(true);
    setResult(null);
    try {
      // Pull the blob from the widget's URL, re-upload through the
      // shared recording endpoint, transcribe, then analyse. The
      // recording type is best-effort (webcam vs voiceover) — the
      // pipeline doesn't care for the analysis math.
      const blobResp = await fetch(url);
      const blob = await blobResp.blob();
      const file = new File([blob], "recording.webm", { type: blob.type });
      const uploaded = await uploadRecording(file, "webcam", projectId);
      const transcription = await transcribeRecording(uploaded.id, file);
      const analysis = await analyzeDelivery({
        recordingId: uploaded.id,
        projectId,
        words: transcription.words,
        totalDurationSec: transcription.durationSec,
        transcribedText: transcription.text,
      });
      setResult(analysis);
    } catch (err) {
      toast({
        title: "Couldn't analyse delivery",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 justify-start px-2 text-xs">
          <Gauge className="mr-1.5 h-3.5 w-3.5" />
          Delivery coach
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Delivery Coach</DialogTitle>
          <DialogDescription>
            Pick a recorded webcam clip or voiceover; we'll transcribe it,
            score pacing / filler words / energy / clarity, and surface
            suggestions.
          </DialogDescription>
        </DialogHeader>

        {candidates.length === 0 && !result && (
          <p className="py-4 text-center text-xs text-muted-foreground">
            No recordings on the canvas yet. Drop a webcam widget or add a
            voiceover and come back here.
          </p>
        )}

        {candidates.length > 0 && !result && !isAnalyzing && (
          <ul className="flex max-h-[200px] flex-col gap-1 overflow-y-auto py-2">
            {candidates.map((c) => (
              <li key={c.id}>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start text-xs"
                  onClick={() => runAnalysis(c.url)}
                >
                  Analyse — {c.label}
                </Button>
              </li>
            ))}
          </ul>
        )}

        {(isAnalyzing || result) && (
          <Suspense fallback={null}>
            <DeliveryCoach
              result={result}
              isAnalyzing={isAnalyzing}
              onReRecord={() => setResult(null)}
            />
          </Suspense>
        )}
      </DialogContent>
    </Dialog>
  );
}
