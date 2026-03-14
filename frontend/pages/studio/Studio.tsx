import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  Video,
  Sparkles,
  Play,
  CheckCircle,
  Youtube,
  Share2,
  Download,
  ArrowRight,
  ArrowLeft,
  Loader2,
} from "lucide-react";

import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import Footer from "@/components/Footer";
import { useSidebar } from "@/hooks/use-sidebar";
import { useSEO } from "@/lib/seo";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  studioService,
  type Storyboard,
  type StoryboardScene,
  StudioProjectStatus,
} from "@/lib/services/studio-service";

// ─── Step definitions ─────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: "Upload Resume", icon: Upload },
  { id: 2, label: "Storyboard", icon: Sparkles },
  { id: 3, label: "Record", icon: Video },
  { id: 4, label: "Publish", icon: Youtube },
  { id: 5, label: "Ready", icon: CheckCircle },
] as const;

type StepId = (typeof STEPS)[number]["id"];

// ─── Scene renderer (no Three.js scene graph – pure Canvas 2D for simplicity) ─

interface SceneRenderConfig {
  scene: StoryboardScene;
  canvas: HTMLCanvasElement;
  elapsed: number; // seconds into this scene
  colors: string[];
}

function renderScene({ scene, canvas, elapsed, colors }: SceneRenderConfig) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const primary = colors[0] ?? "#7c3aed";
  const secondary = colors[1] ?? "#2563eb";

  ctx.clearRect(0, 0, w, h);

  if (scene.type === "intro") {
    // Gradient background
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, primary);
    grad.addColorStop(1, secondary);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Floating particles
    const count = 40;
    for (let i = 0; i < count; i++) {
      const seed = i * 137.5;
      const x = ((Math.sin(seed + elapsed * 0.3) * 0.5 + 0.5) * w * 1.1) % w;
      const y = ((Math.cos(seed * 0.7 + elapsed * 0.2) * 0.5 + 0.5) * h * 1.1) % h;
      const r = 2 + (i % 5);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.4 * (i % 3) * 0.33})`;
      ctx.fill();
    }

    // Title text
    const alpha = Math.min(1, elapsed * 0.8);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${Math.round(w * 0.06)}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(scene.title ?? "Hello, World!", w / 2, h / 2 - 20);
    ctx.font = `${Math.round(w * 0.03)}px Inter, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(scene.subtitle ?? "", w / 2, h / 2 + 30);
    ctx.globalAlpha = 1;
  } else if (scene.type === "achievement") {
    // Dark gradient bg
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#0f172a");
    grad.addColorStop(1, "#1e1b4b");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Animated text entry
    const lines = [
      scene.title ?? "Achievement",
      scene.text ?? scene.subtitle ?? "",
    ].filter(Boolean);
    lines.forEach((line, idx) => {
      const offset = Math.max(0, elapsed - idx * 0.4);
      const x = Math.max(w * 0.1, w * 0.1 + (1 - Math.min(1, offset * 2)) * w * 0.2);
      ctx.globalAlpha = Math.min(1, offset * 2);
      ctx.fillStyle = idx === 0 ? "#a78bfa" : "#e2e8f0";
      ctx.font =
        idx === 0
          ? `bold ${Math.round(w * 0.055)}px Inter, sans-serif`
          : `${Math.round(w * 0.032)}px Inter, sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText(line, x, h * 0.4 + idx * h * 0.12);
    });
    ctx.globalAlpha = 1;
  } else if (scene.type === "skills") {
    // Radial gradient
    const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.7);
    grad.addColorStop(0, "#1e1b4b");
    grad.addColorStop(1, "#0f172a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const skills = scene.skills ?? ["TypeScript", "React", "Node.js", "SQL", "AWS"];
    const skillColors = [
      "#7c3aed",
      "#2563eb",
      "#059669",
      "#d97706",
      "#dc2626",
      "#0891b2",
    ];
    skills.forEach((skill, idx) => {
      const angle = (idx / skills.length) * Math.PI * 2 + elapsed * 0.5;
      const radius = Math.min(w, h) * 0.3;
      const cx = w / 2 + Math.cos(angle) * radius;
      const cy = h / 2 + Math.sin(angle) * radius * 0.7;
      const r = Math.min(w, h) * 0.08;
      const alpha = Math.min(1, (elapsed - idx * 0.15) * 2);
      if (alpha <= 0) return;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = skillColors[idx % skillColors.length];
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${Math.round(r * 0.45)}px Inter, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(skill.slice(0, 8), cx, cy);
      ctx.textBaseline = "alphabetic";
      ctx.globalAlpha = 1;
    });

    // Centre label
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${Math.round(w * 0.04)}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(scene.title ?? "Skills", w / 2, h / 2);
  } else {
    // closing – fade-out gradient
    const progress = Math.min(1, elapsed / (scene.duration || 3));
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, primary);
    grad.addColorStop(1, secondary);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1 - progress;
    ctx.fillStyle = "rgba(0,0,0,0.85)";
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = Math.max(0, 0.9 - progress);
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${Math.round(w * 0.05)}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(scene.title ?? "Thank You", w / 2, h / 2);
    ctx.globalAlpha = 1;
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepIndicator({
  currentStep,
}: {
  currentStep: StepId;
}) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((step, idx) => {
        const done = step.id < currentStep;
        const active = step.id === currentStep;
        return (
          <div key={step.id} className="flex items-center">
            <div
              className={[
                "flex items-center justify-center w-8 h-8 rounded-full text-xs font-semibold transition-all duration-300",
                done
                  ? "bg-green-500 text-white"
                  : active
                    ? "bg-primary text-primary-foreground scale-110 ring-2 ring-primary ring-offset-2"
                    : "bg-muted text-muted-foreground",
              ].join(" ")}
            >
              {done ? <CheckCircle className="w-4 h-4" /> : step.id}
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={[
                  "w-8 h-0.5 mx-1 transition-all duration-500",
                  done ? "bg-green-500" : "bg-muted",
                ].join(" ")}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Step 1: Resume Upload ────────────────────────────────────────────────────

function StepUpload({
  onNext,
}: {
  onNext: (text: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFile = useCallback(
    async (file: File) => {
      setFileName(file.name);
      setLoading(true);
      try {
        if (file.type === "text/plain" || file.name.endsWith(".txt")) {
          const text = await file.text();
          setResumeText(text);
        } else if (
          file.name.endsWith(".docx") ||
          file.type ===
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ) {
          // Basic DOCX text extraction via FileReader (raw XML text)
          const buffer = await file.arrayBuffer();
          const { default: JSZip } = await import("jszip").catch(() => ({
            default: null,
          }));
          if (JSZip) {
            const zip = await JSZip.loadAsync(buffer);
            const wordDoc = zip.file("word/document.xml");
            if (wordDoc) {
              const xmlText = await wordDoc.async("string");
              const stripped = xmlText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
              setResumeText(stripped);
            } else {
              setResumeText("[Could not extract DOCX text – paste your resume below]");
            }
          } else {
            setResumeText("[JSZip not available – paste your resume text below]");
          }
        } else if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
          setResumeText("[PDF detected – please paste your resume text below for AI processing]");
        } else {
          const text = await file.text();
          setResumeText(text);
        }
      } catch {
        toast({
          title: "File read error",
          description: "Could not read the file. Please paste your resume text manually.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-foreground mb-2">
          Upload Your Resume
        </h2>
        <p className="text-muted-foreground">
          Upload a PDF, DOCX, or TXT file – or paste your resume text directly.
        </p>
      </div>

      {/* Drop zone */}
      <div
        className={[
          "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors duration-200",
          dragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/30",
        ].join(" ")}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt,text/plain,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        {loading ? (
          <Loader2 className="mx-auto h-10 w-10 text-primary animate-spin" />
        ) : (
          <>
            <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
            <p className="font-medium text-foreground">
              {fileName ? fileName : "Drop your resume here"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              PDF · DOCX · TXT — or click to browse
            </p>
          </>
        )}
      </div>

      {/* Text area */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Resume Text Preview / Manual Input
        </label>
        <textarea
          className="w-full h-48 rounded-lg border border-border bg-muted/30 p-3 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-y"
          placeholder="Your resume text will appear here, or paste it manually…"
          value={resumeText}
          onChange={(e) => setResumeText(e.target.value)}
        />
      </div>

      <div className="flex justify-end">
        <Button
          onClick={() => onNext(resumeText)}
          disabled={!resumeText.trim()}
          className="gap-2"
        >
          Generate Storyboard <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Step 2: Storyboard ───────────────────────────────────────────────────────

const SCENE_TYPE_COLORS: Record<string, string> = {
  intro: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
  achievement: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  skills: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  closing: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
};

function StepStoryboard({
  resumeText,
  storyboard,
  setStoryboard,
  onNext,
  onBack,
}: {
  resumeText: string;
  storyboard: Storyboard | null;
  setStoryboard: (s: Storyboard | null) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (storyboard) return;
    let cancelled = false;

    const generate = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await studioService.generateStoryboard(resumeText);
        if (!cancelled) setStoryboard(res.data);
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "Storyboard generation failed";
          setError(msg);
          toast({ title: "Error", description: msg, variant: "destructive" });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    generate();
    return () => {
      cancelled = true;
    };
  }, [resumeText, storyboard, setStoryboard, toast]);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-foreground mb-2">AI Storyboard</h2>
        <p className="text-muted-foreground">
          Your resume has been transformed into a cinematic storyboard.
        </p>
      </div>

      {loading && (
        <div className="flex flex-col items-center gap-4 py-16">
          <Loader2 className="h-12 w-12 text-primary animate-spin" />
          <p className="text-muted-foreground">Generating your storyboard with AI…</p>
        </div>
      )}

      {error && !loading && (
        <Card className="border-destructive">
          <CardContent className="p-6 text-center text-destructive">
            <p className="font-medium">{error}</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => {
                setError(null);
                setStoryboard(null);
              }}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {storyboard && !loading && (
        <>
          {/* Style chip row */}
          <div className="flex flex-wrap gap-2 justify-center">
            <Badge variant="outline">Theme: {storyboard.style.theme}</Badge>
            <Badge variant="outline">Font: {storyboard.style.font_style}</Badge>
            {storyboard.style.color_palette.map((c) => (
              <span
                key={c}
                className="inline-flex items-center gap-1.5 text-xs border border-border rounded-full px-2 py-0.5"
              >
                <span
                  className="inline-block w-3 h-3 rounded-full border border-border"
                  style={{ background: c }}
                />
                {c}
              </span>
            ))}
          </div>

          {/* Scene cards */}
          <div className="grid gap-4 sm:grid-cols-2">
            {storyboard.scenes.map((scene, idx) => (
              <Card key={idx} className="border-border">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      Scene {idx + 1} — {scene.title ?? scene.type}
                    </CardTitle>
                    <Badge className={SCENE_TYPE_COLORS[scene.type] ?? ""}>
                      {scene.type}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1 text-sm text-muted-foreground">
                  {scene.subtitle && <p>{scene.subtitle}</p>}
                  {scene.text && <p className="line-clamp-2">{scene.text}</p>}
                  {scene.skills && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {scene.skills.map((s) => (
                        <Badge key={s} variant="secondary" className="text-xs">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <p className="text-xs pt-1 text-muted-foreground/70">
                    🎥 {scene.visual} · ⏱ {scene.duration}s
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <Button onClick={onNext} disabled={!storyboard || loading} className="gap-2">
          <Play className="w-4 h-4" /> Generate Video
        </Button>
      </div>
    </div>
  );
}

// ─── Step 3: Record ───────────────────────────────────────────────────────────

function StepRecord({
  storyboard,
  onNext,
  onBack,
}: {
  storyboard: Storyboard;
  onNext: (blob: Blob) => void;
  onBack: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rafRef = useRef<number>(0);
  const { toast } = useToast();

  const startRecording = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setRecording(true);
    setProgress(0);
    setError(null);

    const scenes = storyboard.scenes;
    const colors = storyboard.style.color_palette;
    const totalDuration = scenes.reduce((acc, s) => acc + s.duration, 0);

    // Capture stream at 30 fps
    let stream: MediaStream;
    try {
      stream = canvas.captureStream(30);
    } catch {
      setError("Your browser does not support canvas.captureStream(). Try Chrome or Edge.");
      setRecording(false);
      return;
    }

    const chunks: Blob[] = [];
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : MediaRecorder.isTypeSupported("video/webm")
        ? "video/webm"
        : "";

    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType || "video/webm" });
      setDone(true);
      setRecording(false);
      setProgress(100);
      onNext(blob);
    };

    recorder.start(250); // collect data every 250ms

    // Animate scenes using wall-clock time to avoid desync from frame drops
    const startTime = performance.now();

    const tick = (ts: number) => {
      const totalElapsed = (ts - startTime) / 1000;

      // Determine which scene we're in
      let sceneIdx = 0;
      let sceneStart = 0;
      for (let i = 0; i < scenes.length; i++) {
        if (totalElapsed < sceneStart + scenes[i].duration) {
          sceneIdx = i;
          break;
        }
        sceneStart += scenes[i].duration;
        sceneIdx = i;
      }

      const sceneElapsed = totalElapsed - sceneStart;
      const scene = scenes[sceneIdx];
      if (scene) {
        renderScene({ scene, canvas, elapsed: sceneElapsed, colors });
      }

      setProgress(Math.min(99, (totalElapsed / totalDuration) * 100));

      if (totalElapsed >= totalDuration) {
        recorder.stop();
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [storyboard, onNext]);

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-foreground mb-2">Record Video</h2>
        <p className="text-muted-foreground">
          We'll render your storyboard scenes and capture them as a video.
        </p>
      </div>

      {/* Canvas */}
      <div className="flex justify-center">
        <canvas
          ref={canvasRef}
          width={960}
          height={540}
          className="w-full max-w-2xl rounded-xl border border-border shadow-lg bg-black"
        />
      </div>

      {recording && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Recording…</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      )}

      {done && (
        <div className="flex items-center gap-2 text-green-600 font-medium justify-center">
          <CheckCircle className="w-5 h-5" /> Recording complete!
        </div>
      )}

      {error && (
        <p className="text-center text-destructive text-sm">{error}</p>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} disabled={recording} className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        {!recording && !done && (
          <Button onClick={startRecording} className="gap-2">
            <Video className="w-4 h-4" /> Start Recording
          </Button>
        )}
        {recording && (
          <Button disabled className="gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Recording…
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Step 4: Upload & Publish ─────────────────────────────────────────────────

function StepPublish({
  videoBlob,
  onNext,
  onBack,
}: {
  videoBlob: Blob;
  onNext: (youtubeId: string) => void;
  onBack: () => void;
}) {
  const [phase, setPhase] = useState<"idle" | "uploading" | "publishing" | "polling" | "done" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [title, setTitle] = useState("My Video Resume");
  const [description, setDescription] = useState("AI-generated video resume created with MyVideoResu.ME");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();

  const handlePublish = useCallback(async () => {
    setPhase("uploading");
    setProgress(10);
    setErrorMsg(null);

    try {
      // Upload video
      const uploadRes = await studioService.uploadVideo(videoBlob, title);
      const projectId = uploadRes.data.id;
      setProgress(50);
      setPhase("publishing");

      // Trigger YouTube publish
      await studioService.publishVideo(projectId, { title, description });
      setProgress(60);
      setPhase("polling");

      // Poll for completion
      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await studioService.getProjectStatus(projectId);
          const { status, progressPercentage, youtubeVideoId } = statusRes.data;

          setProgress(60 + (progressPercentage ?? 0) * 0.4);

          if (
            status === StudioProjectStatus.Completed &&
            youtubeVideoId
          ) {
            if (pollRef.current) clearInterval(pollRef.current);
            setProgress(100);
            setPhase("done");
            onNext(youtubeVideoId as string);
          } else if (status === StudioProjectStatus.Failed) {
            if (pollRef.current) clearInterval(pollRef.current);
            throw new Error("Publishing failed on the server.");
          }
        } catch (e) {
          if (pollRef.current) clearInterval(pollRef.current);
          const msg = e instanceof Error ? e.message : "Polling error";
          setErrorMsg(msg);
          setPhase("error");
          toast({ title: "Publish error", description: msg, variant: "destructive" });
        }
      }, 3000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setErrorMsg(msg);
      setPhase("error");
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
  }, [videoBlob, title, description, onNext, toast]);

  // Cleanup poll on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const busy = phase === "uploading" || phase === "publishing" || phase === "polling";

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-foreground mb-2">
          Publish to YouTube
        </h2>
        <p className="text-muted-foreground">
          Your video is ready. Add details and publish it!
        </p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Video Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={busy}
              rows={3}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>
        </CardContent>
      </Card>

      {busy && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>
              {phase === "uploading"
                ? "Uploading video…"
                : phase === "publishing"
                  ? "Triggering publish…"
                  : "Publishing to YouTube…"}
            </span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      )}

      {phase === "done" && (
        <div className="flex items-center gap-2 text-green-600 font-medium justify-center">
          <CheckCircle className="w-5 h-5" /> Published successfully!
        </div>
      )}

      {phase === "error" && errorMsg && (
        <p className="text-center text-destructive text-sm">{errorMsg}</p>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} disabled={busy} className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        {phase === "idle" && (
          <Button onClick={handlePublish} className="gap-2">
            <Youtube className="w-4 h-4" /> Publish
          </Button>
        )}
        {busy && (
          <Button disabled className="gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Working…
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Step 5: Ready ────────────────────────────────────────────────────────────

function StepReady({ youtubeVideoId }: { youtubeVideoId: string }) {
  const youtubeUrl = `https://www.youtube.com/watch?v=${youtubeVideoId}`;
  const shareText = encodeURIComponent(`Check out my AI video resume! ${youtubeUrl}`);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">
          Your Video is Live! 🎉
        </h2>
        <p className="text-muted-foreground">
          Your AI-powered video resume is now published on YouTube.
        </p>
      </div>

      {/* YouTube embed */}
      <div className="aspect-video w-full rounded-xl overflow-hidden border border-border shadow-lg">
        <iframe
          className="w-full h-full"
          src={`https://www.youtube.com/embed/${youtubeVideoId}`}
          title="Your Video Resume"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>

      {/* Share + Download actions */}
      <div className="flex flex-wrap gap-3 justify-center">
        <Button
          asChild
          variant="outline"
          className="gap-2"
        >
          <a href={youtubeUrl} target="_blank" rel="noopener noreferrer">
            <Youtube className="w-4 h-4 text-red-500" /> Watch on YouTube
          </a>
        </Button>

        <Button
          asChild
          variant="outline"
          className="gap-2"
        >
          <a
            href={`https://twitter.com/intent/tweet?text=${shareText}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Share2 className="w-4 h-4" /> Share on X
          </a>
        </Button>

        <Button
          asChild
          variant="outline"
          className="gap-2"
        >
          <a
            href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(youtubeUrl)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Share2 className="w-4 h-4 text-blue-500" /> Share on LinkedIn
          </a>
        </Button>

        <Button asChild variant="outline" className="gap-2">
          <a href={youtubeUrl} target="_blank" rel="noopener noreferrer">
            <Download className="w-4 h-4" /> Download from YouTube
          </a>
        </Button>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Video URL:{" "}
        <a
          href={youtubeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          {youtubeUrl}
        </a>
      </p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const slideVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 60 : -60,
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({
    x: dir > 0 ? -60 : 60,
    opacity: 0,
  }),
};

export default function Studio() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user } = useAuth();
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();

  useSEO(location.pathname);

  const [step, setStep] = useState<StepId>(1);
  const [direction, setDirection] = useState(1);
  const [resumeText, setResumeText] = useState("");
  const [storyboard, setStoryboard] = useState<Storyboard | null>(null);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [youtubeVideoId, setYoutubeVideoId] = useState<string>("");

  if (!isAuthenticated || !user) {
    navigate("/login", { replace: true });
    return null;
  }

  const goTo = (next: StepId) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        collapsed={sidebarCollapsed}
      />

      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation
          onMenuClick={openSidebar}
          onSidebarToggle={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />

        <main className="pt-16 p-6">
          <div className="max-w-3xl mx-auto">
            {/* Page header */}
            <div className="mb-8 text-center">
              <div className="inline-flex items-center gap-2 mb-3">
                <Sparkles className="h-6 w-6 text-primary" />
                <h1 className="text-3xl font-bold text-foreground">
                  Studio
                </h1>
              </div>
              <p className="text-muted-foreground">
                Transform your resume into a polished AI video and publish it to YouTube.
              </p>
            </div>

            <StepIndicator currentStep={step} />

            <Card className="border-border shadow-sm overflow-hidden">
              <CardContent className="p-6 sm:p-8">
                <AnimatePresence mode="wait" custom={direction}>
                  <motion.div
                    key={step}
                    custom={direction}
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                  >
                    {step === 1 && (
                      <StepUpload
                        onNext={(text) => {
                          setResumeText(text);
                          goTo(2);
                        }}
                      />
                    )}
                    {step === 2 && (
                      <StepStoryboard
                        resumeText={resumeText}
                        storyboard={storyboard}
                        setStoryboard={setStoryboard}
                        onNext={() => goTo(3)}
                        onBack={() => goTo(1)}
                      />
                    )}
                    {step === 3 && storyboard && (
                      <StepRecord
                        storyboard={storyboard}
                        onNext={(blob) => {
                          setVideoBlob(blob);
                          goTo(4);
                        }}
                        onBack={() => goTo(2)}
                      />
                    )}
                    {step === 4 && videoBlob && (
                      <StepPublish
                        videoBlob={videoBlob}
                        onNext={(ytId) => {
                          setYoutubeVideoId(ytId);
                          goTo(5);
                        }}
                        onBack={() => goTo(3)}
                      />
                    )}
                    {step === 5 && youtubeVideoId && (
                      <StepReady youtubeVideoId={youtubeVideoId} />
                    )}
                  </motion.div>
                </AnimatePresence>
              </CardContent>
            </Card>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}
