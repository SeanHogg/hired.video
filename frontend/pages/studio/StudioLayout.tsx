// StudioLayout.tsx — top-level state owner for the 3-panel Studio workspace.
// Unauthenticated users see a marketing landing. Authenticated users get the
// full workspace.

import { useState, useCallback, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Sparkles,
  Video,
  ArrowRight,
  Star,
  Zap,
  BarChart3,
  Users,
  CheckCircle2,
  Upload,
  Eye,
  TrendingUp,
  Play,
  Share2,
  ChevronDown,
  ChevronRight,
  GripHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useSEO } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { studioService } from "@/lib/services/studio-service";
import { compile } from "@/lib/compiler/video-compiler";
import { exportVideo } from "@/lib/renderer/video-exporter";
import type { StudioProjectState } from "@/types/studio";
import type { VideoScript } from "@/types/video-script";
import type { CompiledVideo } from "@/lib/compiler/types";
import { defaultStudioState } from "@/types/studio";

import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";

import StudioSidebar from "./StudioSidebar";
import StudioEditor, { type EditorTab } from "./StudioEditor";
import StudioPreview from "./StudioPreview";
import StudioSettings from "./StudioSettings";
import StudioFeaturesHub from "./StudioFeaturesHub";
import TimelineEditor from "@/components/TimelineEditor";
import LinkedInPostModal from "@/components/LinkedInPostModal";

/** Strip ephemeral blob: URLs from a script before persisting to the server.
 * Blob URLs are session-scoped and become invalid after a page reload, so they
 * must never be stored in the database. */
function sanitizeScriptForSave(script: VideoScript): VideoScript {
  const cleanTheme = { ...script.video.theme };
  const themeAny = cleanTheme as Record<string, unknown>;
  if (typeof themeAny.customBackground === "string" && themeAny.customBackground.startsWith("blob:")) {
    delete themeAny.customBackground;
  }
  return {
    ...script,
    video: { ...script.video, theme: cleanTheme },
    scenes: script.scenes.map((scene) => ({
      ...scene,
      ...(scene.backgroundImage?.startsWith("blob:") ? { backgroundImage: undefined } : {}),
      ...(scene.sceneAudio?.startsWith("blob:") ? { sceneAudio: undefined, sceneAudioLabel: undefined } : {}),
    })),
  };
}

function makeInitialState(): StudioProjectState {
  return {
    ...defaultStudioState,
    script: null,
    activeTemplate: null,
    compiledVideo: null,
    videoBlob: null,
    projectId: null,
    youtubeVideoId: null,
  };
}

function Landing() {
  return (
    <div className="pt-16">
      <div className="max-w-6xl mx-auto px-4 py-16">

        {/* Hero */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center space-x-2 mb-6">
            <div className="relative">
              <Video className="h-12 w-12 text-primary" />
              <Sparkles className="h-6 w-6 text-brand-blue absolute -top-1 -right-1" />
            </div>
            <span className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
              Video Studio
            </span>
          </div>
          <h1 className="text-5xl font-bold mb-6">
            AI Video Creation for Candidates, Recruiters &amp; Companies
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
            Whether you're a job seeker building a video resume, a recruiter promoting an open role,
            or a company showcasing your brand — our AI writes the script and creates a polished video
            in 60 seconds. No camera, no editing, no experience required.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/signup">
              <Button
                size="lg"
                className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8"
              >
                Create Your Video Resume
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link to="/login">
              <Button size="lg" variant="outline" className="text-lg px-8">
                Sign In
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="grid md:grid-cols-4 gap-6 mb-16">
          {[
            { stat: "60s", label: "Average video creation time" },
            { stat: "3×", label: "More likely to get a callback" },
            { stat: "85%", label: "Higher recruiter response rate" },
            { stat: "500K+", label: "Video resumes created" },
          ].map((s) => (
            <div key={s.stat} className="text-center">
              <div className="text-3xl font-bold text-primary mb-2">{s.stat}</div>
              <p className="text-sm text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Features */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-center mb-12">
            Everything You Need to Stand Out
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <Card className="border-brand-purple/20 hover:border-brand-purple/40 transition-colors">
              <CardHeader>
                <Zap className="h-10 w-10 text-brand-purple mb-4" />
                <CardTitle>AI Script Generation</CardTitle>
                <CardDescription>
                  Our AI reads your resume and writes a compelling video script highlighting your
                  achievements, skills, and personality — tailored to the role you're targeting.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />Job-description-aware personalisation</div>
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />4-scene narrative structure</div>
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />Edit any scene with plain English</div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-brand-blue/20 hover:border-brand-blue/40 transition-colors">
              <CardHeader>
                <BarChart3 className="h-10 w-10 text-brand-blue mb-4" />
                <CardTitle>Professional Video Output</CardTitle>
                <CardDescription>
                  Export a polished 720p or 1080p video with animated scenes, smooth transitions,
                  and professional typography — all rendered directly in your browser.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />720p & 1080p export</div>
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />Minimal, moderate & cinematic motion</div>
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />MP4 download or YouTube publish</div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-primary/20 hover:border-primary/40 transition-colors">
              <CardHeader>
                <Share2 className="h-10 w-10 text-primary mb-4" />
                <CardTitle>Share Everywhere</CardTitle>
                <CardDescription>
                  Publish directly to YouTube, copy a shareable link, or embed your video resume
                  on LinkedIn and personal websites to reach more recruiters.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />One-click YouTube publishing</div>
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />Public shareable link + embed code</div>
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />AI LinkedIn post generator — hook, caption, hashtags</div>
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />One-click "Post to LinkedIn" intent</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* How it works */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
          <div className="grid md:grid-cols-4 gap-8">
            {[
              { icon: Upload, step: "1. Paste Your Resume", desc: "Drop in your resume text or upload a PDF" },
              { icon: Sparkles, step: "2. AI Writes the Script", desc: "AI generates a 4-scene video script in seconds" },
              { icon: Eye, step: "3. Preview & Edit", desc: "Tweak any scene with plain-English instructions" },
              { icon: TrendingUp, step: "4. Export & Share", desc: "Download as MP4 or publish to YouTube" },
            ].map(({ icon: Icon, step, desc }) => (
              <div key={step} className="text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Icon className="h-8 w-8 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">{step}</h3>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Use cases */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-center mb-12">One Studio, Every Use Case</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { emoji: "🎓", title: "Video Resume", desc: "Stand out from the stack with an AI-generated video that tells your story in 30 seconds." },
              { emoji: "📢", title: "Job Ad", desc: "Promote open roles with a compelling 30-second video ad — higher click-through than text." },
              { emoji: "🏢", title: "Company Promo", desc: "Showcase your culture, values, and brand story to attract top talent and customers." },
              { emoji: "🎯", title: "Recruiter Brand", desc: "Build your personal brand as a recruiter with a polished video that showcases your track record." },
            ].map((item) => (
              <div key={item.title} className="p-5 rounded-xl border border-border hover:border-primary/30 transition-colors text-center">
                <span className="text-4xl mb-3 block">{item.emoji}</span>
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Advertising extras */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-center mb-12">Built for Advertising, Not Just Resumes</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="border-brand-purple/20 hover:border-brand-purple/40 transition-colors">
              <CardHeader>
                <Users className="h-10 w-10 text-brand-purple mb-4" />
                <CardTitle>Brand Kits</CardTitle>
                <CardDescription>
                  Save your colours, logo, and font once. Every video automatically applies your brand identity.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card className="border-brand-blue/20 hover:border-brand-blue/40 transition-colors">
              <CardHeader>
                <BarChart3 className="h-10 w-10 text-brand-blue mb-4" />
                <CardTitle>Video Analytics</CardTitle>
                <CardDescription>
                  Track views and CTA clicks per video. Group into campaigns and measure performance across channels.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card className="border-primary/20 hover:border-primary/40 transition-colors">
              <CardHeader>
                <Play className="h-10 w-10 text-primary mb-4" />
                <CardTitle>Embed &amp; Share</CardTitle>
                <CardDescription>
                  Embed on your website or job posting, share via public link, or generate a QR code CTA.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card className="border-green-500/20 hover:border-green-500/40 transition-colors">
              <CardHeader>
                <Share2 className="h-10 w-10 text-green-600 mb-4" />
                <CardTitle>LinkedIn Post AI</CardTitle>
                <CardDescription>
                  AI generates a hook, caption, and hashtags for your video. One click posts it to LinkedIn — ready in seconds.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>

        {/* Testimonials */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-center mb-12">What Candidates Are Saying</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                quote: "I got 5 interview requests within a week of sharing my video resume. Recruiters actually watched the whole thing. A text resume never did that.",
                name: "Sarah Chen",
                title: "Software Engineer",
              },
              {
                quote: "As a career changer it was hard to explain my transition in writing. The video let me tell my story in a way that finally resonated with hiring managers.",
                name: "Michael Rodriguez",
                title: "Marketing Manager",
              },
              {
                quote: "Landed a Fortune 500 role after posting my video on LinkedIn. Two recruiters messaged me within 24 hours saying it was the most impressive application they'd seen.",
                name: "Emma Johnson",
                title: "Product Designer",
              },
            ].map((t) => (
              <Card key={t.name}>
                <CardContent className="p-6">
                  <div className="flex items-center mb-4">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                  <p className="text-sm mb-4">"{t.quote}"</p>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-r from-brand-purple to-brand-blue rounded-full" />
                    <div>
                      <p className="font-medium text-sm">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.title}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Final CTA */}
        <div className="text-center bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 p-8 rounded-2xl">
          <h3 className="text-2xl font-bold mb-4">
            Ready to Create Your Video Resume?
          </h3>
          <p className="text-muted-foreground mb-6">
            Join thousands of professionals who have transformed their job search with video.
          </p>
          <Link to="/signup">
            <Button
              size="lg"
              className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
            >
              Get Started Free
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>

      </div>
      <Footer />
    </div>
  );
}

export default function StudioLayout() {
  useSEO("/studio", { title: "Studio — hired.video", description: "Create your AI video resume" });

  const { user } = useAuth();
  const { toast } = useToast();

  // App-level nav — Studio defaults to collapsed sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  const [state, setState] = useState<StudioProjectState>(makeInitialState);
  const [compiledVideo, setCompiledVideo] = useState<CompiledVideo | null>(null);
  const [tab, setTab] = useState<EditorTab>("prompt");
  const [showJD, setShowJD] = useState(false);
  const [projects, setProjects] = useState<import("@/lib/services/studio-service").StudioProject[]>([]);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [exportProgress, setExportProgress] = useState(0);
  const [isPublic, setIsPublic] = useState(false);
  const [isPublishedToProfile, setIsPublishedToProfile] = useState(false);
  const [linkedInOpen, setLinkedInOpen] = useState(false);
  const [focusedSceneId, setFocusedSceneId] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const [videoHeight, setVideoHeight] = useState(() => {
    const saved = localStorage.getItem("studio_video_height");
    return saved ? Math.max(80, parseInt(saved, 10)) : 160;
  });
  const [onboardingStep, setOnboardingStep] = useState<number>(() => {
    return localStorage.getItem("studio_onboarded") ? -1 : 0;
  });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ y: 0, height: 0 });

  // ── Video panel drag-to-resize ────────────────────────────────────────────
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!isDraggingRef.current) return;
      const delta = e.clientY - dragStartRef.current.y;
      const newHeight = Math.max(80, dragStartRef.current.height + delta);
      setVideoHeight(newHeight);
      localStorage.setItem("studio_video_height", String(newHeight));
    }
    function onMouseUp() {
      isDraggingRef.current = false;
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  // ── Undo / Redo ───────────────────────────────────────────────────────────
  const historyRef = useRef<VideoScript[]>([]);
  const historyIdxRef = useRef(-1);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  function syncUndoState() {
    setCanUndo(historyIdxRef.current > 0);
    setCanRedo(historyIdxRef.current < historyRef.current.length - 1);
  }

  function pushHistory(script: VideoScript) {
    // Truncate redo stack, then push
    historyRef.current = historyRef.current.slice(0, historyIdxRef.current + 1);
    historyRef.current.push(script);
    if (historyRef.current.length > 50) historyRef.current.shift();
    historyIdxRef.current = historyRef.current.length - 1;
    syncUndoState();
  }

  function handleUndo() {
    if (historyIdxRef.current <= 0) return;
    historyIdxRef.current--;
    const script = historyRef.current[historyIdxRef.current];
    patchState({ script });
    recompile(script);
    syncUndoState();
  }

  function handleRedo() {
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    historyIdxRef.current++;
    const script = historyRef.current[historyIdxRef.current];
    patchState({ script });
    recompile(script);
    syncUndoState();
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === "z" && !e.shiftKey) { e.preventDefault(); handleUndo(); }
      if ((e.key === "z" && e.shiftKey) || e.key === "y") { e.preventDefault(); handleRedo(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const patchState = useCallback((patch: Partial<StudioProjectState>) => {
    setState((s) => ({ ...s, ...patch }));
  }, []);

  function recompile(script: VideoScript) {
    try {
      const cv = compile(script);
      setCompiledVideo(cv);
      return cv;
    } catch (e) {
      console.error("[studio] compile error", e);
      return null;
    }
  }

  function handleScriptChange(script: VideoScript) {
    pushHistory(script);
    patchState({ script });
    recompile(script);
  }

  // ── Load recent projects on mount ──────────────────────────────────────────

  useEffect(() => {
    if (!user) return;
    studioService.getProjects().then((r) => {
      if (r.data) setProjects(r.data);
    }).catch(() => {});
  }, [user]);

  // ── Generate ───────────────────────────────────────────────────────────────

  async function handleGenerate() {
    if (!state.resumeText.trim()) return;
    patchState({ status: "generating" });
    setPlaying(false);
    setCurrentTime(0);

    try {
      const res = await studioService.generateStoryboard({
        resumeText: state.resumeText,
        resumeId: state.resumeId,
        prompt: state.prompt,
        jobDescription: state.jobDescription,
        model: state.model,
        temperature: state.temperature,
        targetDuration: state.targetDuration,
        resolution: state.resolution,
        motion: state.motion,
      });

      if (!res.data) throw new Error("No data returned");

      let script = res.data;
      const prevScript = state.script;

      // Preserve theme: re-apply template theme if active, otherwise keep user's customized theme
      if (state.activeTemplate) {
        script = { ...script, video: { ...script.video, theme: { ...state.activeTemplate.video.theme } } };
      } else if (prevScript?.video.theme) {
        script = { ...script, video: { ...script.video, theme: prevScript.video.theme } };
      }

      // Preserve music selection
      if (prevScript?.video.audio) {
        script = { ...script, video: { ...script.video, audio: prevScript.video.audio } };
      }

      // Preserve per-scene user customizations (AI images, uploaded images, scene audio) by index
      if (prevScript?.scenes?.length) {
        script = {
          ...script,
          scenes: script.scenes.map((scene, i) => {
            const prev = prevScript.scenes[i];
            if (!prev) return scene;
            return {
              ...scene,
              ...(prev.backgroundImage ? { backgroundImage: prev.backgroundImage, backgroundImagePosition: prev.backgroundImagePosition } : {}),
              ...(prev.sceneAudio ? { sceneAudio: prev.sceneAudio, sceneAudioLabel: prev.sceneAudioLabel } : {}),
              ...(prev.accentColor ? { accentColor: prev.accentColor } : {}),
            };
          }),
        };
      }

      // Seed undo history with the fresh generation
      historyRef.current = [script];
      historyIdxRef.current = 0;
      syncUndoState();

      const cv = recompile(script);
      patchState({ script, status: "ready" });
      if (cv) setCompiledVideo(cv);
      setTab("storyboard");
    } catch (e: unknown) {
      patchState({ status: "error" });
      toast({ title: "Generation failed", description: String(e), variant: "destructive" });
    }
  }

  // ── Export ─────────────────────────────────────────────────────────────────

  async function handleExport() {
    if (!compiledVideo) return;
    patchState({ status: "exporting" });
    setExportProgress(0);

    try {
      const blob = await exportVideo(compiledVideo, {
        onProgress: setExportProgress,
        audio: state.script?.video?.audio,
      });
      patchState({ videoBlob: blob, status: "ready" });

      // Auto-download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${state.name.replace(/\s+/g, "-")}.mp4`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);

      toast({ title: "Export complete", description: "Your video has been downloaded." });

      // Update project status to Exported if saved
      if (state.projectId) {
        studioService.updateProjectStatus(state.projectId, "exported").then((r) => {
          if (r.data) {
            setProjects((prev) => prev.map((p) => p.id === r.data!.id ? r.data! : p));
          }
        }).catch(() => {});
      }
    } catch (e: unknown) {
      patchState({ status: "error" });
      toast({ title: "Export failed", description: String(e), variant: "destructive" });
    }
  }

  // ── Publish ────────────────────────────────────────────────────────────────

  async function handlePublish() {
    if (!state.videoBlob) return;
    patchState({ status: "uploading" });

    try {
      const uploadRes = await studioService.uploadVideo(
        state.videoBlob,
        state.name,
        state.projectId ?? undefined,
        state.resumeId,
      );
      if (!uploadRes.data) throw new Error("Upload failed");

      const projectId = uploadRes.data.id;
      patchState({ projectId, status: "publishing" });

      const pubRes = await studioService.publishVideo(
        projectId,
        { title: state.name, description: "", privacyStatus: isPublic ? "public" : "unlisted" },
        state.resumeId,
      );
      if (!pubRes.data) throw new Error("Publish failed");

      patchState({
        youtubeVideoId: pubRes.data.youtubeVideoId,
        status: "done",
      });
      toast({ title: "Published!", description: "Your video is live." });
    } catch (e: unknown) {
      patchState({ status: "error" });
      toast({ title: "Publish failed", description: String(e), variant: "destructive" });
    }
  }

  // ── Other handlers ─────────────────────────────────────────────────────────

  function handleCreateNew() {
    setState(makeInitialState()); // clears activeTemplate
    setCompiledVideo(null);
    setTab("prompt");
    setCurrentTime(0);
    setPlaying(false);
    setIsPublic(false);
  }

  function handleProjectSelect(p: import("@/lib/services/studio-service").StudioProject) {
    const script = p.script ?? null;
    const cv = script ? recompile(script) : null;
    setState({
      ...makeInitialState(),
      name: p.title,
      projectId: p.id,
      youtubeVideoId: p.youtubeVideoId ?? null,
      script,
      resumeText: p.resumeText ?? "",
      prompt: p.prompt ?? defaultStudioState.prompt,
      jobDescription: p.jobDescription ?? "",
      ...(script?._meta?.model ? { model: script._meta.model } : {}),
    });
    setCompiledVideo(cv);
    setIsPublishedToProfile(p.status === "Published");
    setIsPublic(p.isPublic ?? false);
    setTab(script ? "storyboard" : "prompt");
  }

  function handleTemplateLoad(script: VideoScript) {
    if (state.script && state.script.scenes.length > 0) {
      const hasCustomTheme = JSON.stringify(state.script.video.theme) !== JSON.stringify(state.activeTemplate?.video.theme);
      const msg = hasCustomTheme
        ? "Apply this template's theme? Your scene content will be kept, but your current theme customisations will be replaced."
        : "Apply this template's theme to your current scenes?";
      if (!window.confirm(msg)) return;

      const merged: VideoScript = {
        ...state.script,
        video: { ...state.script.video, theme: { ...script.video.theme } },
      };
      const cv = recompile(merged);
      patchState({ script: merged, activeTemplate: script, status: cv ? "ready" : "error", motion: script.video.theme.motion });
      setCompiledVideo(cv);
      return;
    }

    const cv = recompile(script);
    patchState({
      script,
      activeTemplate: script,
      status: cv ? "ready" : "error",
      motion: script.video.theme.motion,
      targetDuration: script.video.duration,
      resolution: (script.video.resolution as "720p" | "1080p") ?? state.resolution,
    });
    setCompiledVideo(cv);

    if (!state.resumeText.trim()) {
      setTab("prompt");
      toast({ title: "Template loaded", description: "Paste your resume to personalise it." });
    } else {
      setTab("storyboard");
    }
  }

  async function handleMakePublic(pub: boolean) {
    setIsPublic(pub);
    if (!state.projectId) return;
    try {
      await studioService.updateProjectVisibility(state.projectId, pub);
      toast({ title: pub ? "Video is now public" : "Video is now unlisted" });
    } catch (e: unknown) {
      setIsPublic(!pub); // revert on failure
      toast({ title: "Failed to update visibility", description: String(e), variant: "destructive" });
    }
  }

  async function handleDeleteProject(id: string) {
    try {
      await studioService.deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      // If it was the active project, reset workspace
      if (state.projectId === id) {
        handleCreateNew();
      }
    } catch {
      toast({ title: "Delete failed", description: "Could not delete project.", variant: "destructive" });
    }
  }

  async function handlePublishToProfile() {
    if (!state.videoBlob && !state.projectId) return;
    try {
      patchState({ status: "uploading" });
      let projectId = state.projectId;

      // Upload video blob if we have one (creates a proper video record with r2Key)
      if (state.videoBlob) {
        const uploadRes = await studioService.uploadVideo(
          state.videoBlob,
          state.name,
          projectId ?? undefined,
          state.resumeId,
        );
        if (!uploadRes.data) throw new Error("Upload failed");
        projectId = uploadRes.data.id;
        patchState({ projectId });
      } else if (!projectId) {
        // No blob, no project — save draft first (sanitize blob: URLs before persisting)
        const saveRes = await studioService.saveDraft(state.name, state.resumeText, state.script ? sanitizeScriptForSave(state.script) : null);
        if (!saveRes.data) throw new Error("Save failed");
        projectId = saveRes.data.id;
        patchState({ projectId });
      }

      const res = await studioService.updateProjectStatus(projectId!, "published");
      if (res.data) {
        setProjects((prev) => prev.map((p) => p.id === res.data!.id ? res.data! : p));
        setIsPublishedToProfile(true);
        patchState({ status: "done" });
        toast({ title: "Published to profile!", description: "Your video is now visible on your profile." });
      }
    } catch (e: unknown) {
      patchState({ status: "error" });
      toast({ title: "Publish failed", description: String(e), variant: "destructive" });
    }
  }

  // ── Background select ──────────────────────────────────────────────────────

  function handleBackgroundSelect(bgValue: string, customImageUrl?: string) {
    if (!state.script) return;
    // Parse "type:color1:color2" or "type:color1" → background enum + palette hint
    const [bgType] = bgValue.split(":");
    const validBg = ["gradient", "dark-tech-grid", "particles", "solid"].includes(bgType)
      ? (bgType as "gradient" | "dark-tech-grid" | "particles" | "solid")
      : "gradient";

    // Extract colors from value (e.g. "gradient:#7c3aed:#2563eb")
    const parts = bgValue.split(":");
    const colors = parts.slice(1).filter((p) => p.startsWith("#"));

    const updatedScript: VideoScript = {
      ...state.script,
      video: {
        ...state.script.video,
        theme: {
          ...state.script.video.theme,
          background: validBg,
          ...(colors.length > 0 ? { colorPalette: colors } : {}),
        },
      },
    };

    if (customImageUrl) {
      // Store as a special background value on the theme (handled by canvas renderer)
      (updatedScript.video.theme as unknown as Record<string, unknown>).customBackground = customImageUrl;
    }

    handleScriptChange(updatedScript);
  }

  // ── Save draft ─────────────────────────────────────────────────────────────

  async function handleSave() {
    setIsSaving(true);
    try {
      // Embed model setting into the script metadata so it round-trips through the DB.
      // Sanitize to remove blob: URLs which are session-scoped and invalid after reload.
      const scriptToSave = state.script
        ? sanitizeScriptForSave({ ...state.script, _meta: { ...state.script._meta, model: state.model } })
        : null;
      const res = await studioService.saveDraft(
        state.name,
        state.resumeText,
        scriptToSave,
        state.projectId ?? undefined,
        state.prompt,
        state.jobDescription,
      );
      if (!res.data) throw new Error("Save failed");
      const saved = res.data;
      patchState({ projectId: saved.id });
      // Refresh recent projects list
      setProjects((prev) => {
        const without = prev.filter((p) => p.id !== saved.id);
        return [saved, ...without];
      });
      toast({ title: "Saved", description: `"${saved.title}" saved to Recent Projects.` });
    } catch (e: unknown) {
      toast({ title: "Save failed", description: String(e), variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          collapsed={sidebarCollapsed}
        />
        <div className={cn("transition-all duration-500", sidebarCollapsed ? "lg:ml-16" : "lg:ml-80")}>
          <Navigation
            onMenuClick={() => setSidebarOpen(true)}
            onSidebarToggle={() => setSidebarCollapsed((c) => !c)}
            sidebarCollapsed={sidebarCollapsed}
          />
          <Landing />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
      />
      <div className={cn("transition-all duration-500", sidebarCollapsed ? "lg:ml-16" : "lg:ml-80")}>
        <Navigation
          onMenuClick={() => setSidebarOpen(true)}
          onSidebarToggle={() => setSidebarCollapsed((c) => !c)}
          sidebarCollapsed={sidebarCollapsed}
        />
        <div className="pt-16 flex h-[calc(100vh-64px)] overflow-hidden">
          <StudioSidebar
            projects={projects}
            activeProjectId={state.projectId}
            projectName={state.name}
            onProjectNameChange={(name) => patchState({ name })}
            onSave={handleSave}
            isSaving={isSaving}
            onCreateNew={handleCreateNew}
            onProjectSelect={handleProjectSelect}
            onDeleteProject={handleDeleteProject}
            onTemplateLoad={handleTemplateLoad}
            onBackgroundSelect={handleBackgroundSelect}
            script={state.script}
            onScriptChange={handleScriptChange}
          />

          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
            {/* Video preview — height controlled by drag handle */}
            <div className="shrink-0 overflow-hidden border-b" style={{ height: videoHeight }}>
              <StudioPreview
                state={state}
                compiledVideo={compiledVideo}
                playing={playing}
                currentTime={currentTime}
                exportProgress={exportProgress}
                onPlayPause={() => setPlaying((p) => !p)}
                onTimeUpdate={setCurrentTime}
                onExport={handleExport}
                onPublish={handlePublish}
                onPublishToProfile={handlePublishToProfile}
                isPublishedToProfile={isPublishedToProfile}
                profileUrl={user?.id ? `/people/${user.id}` : undefined}
                onLinkedInPost={() => setLinkedInOpen(true)}
                onMakePublic={handleMakePublic}
                isPublic={isPublic}
                showActions={false}
                className="w-full h-full"
              />
            </div>

            {/* Drag handle — grab to resize video preview */}
            <div
              className="shrink-0 h-2 flex items-center justify-center cursor-row-resize bg-border/30 hover:bg-primary/20 transition-colors group border-b"
              onMouseDown={(e) => {
                isDraggingRef.current = true;
                dragStartRef.current = { y: e.clientY, height: videoHeight };
                e.preventDefault();
              }}
            >
              <GripHorizontal className="w-4 h-3 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
            </div>

            {/* Timeline — collapsible, collapsed by default */}
            <div className="shrink-0 border-b">
              <button
                type="button"
                className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setTimelineOpen((v) => !v)}
              >
                {timelineOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                Timeline
              </button>
              {timelineOpen && (
                state.script ? (
                  <TimelineEditor
                    script={state.script}
                    currentTime={currentTime}
                    onSeek={(t) => { setCurrentTime(t); setPlaying(false); }}
                    focusedSceneId={focusedSceneId}
                    onSceneFocus={(id) => { setFocusedSceneId(id); setTab("storyboard"); }}
                  />
                ) : (
                  <div className="px-5 py-3 text-xs text-muted-foreground">
                    Generate a script to see the timeline
                  </div>
                )
              )}
            </div>

            {/* Prompt / Storyboard tabs — fills remaining space (when features closed) */}
            {!featuresOpen && (
              <StudioEditor
                tab={tab}
                onTabChange={setTab}
                state={state}
                onStateChange={patchState}
                showJD={showJD}
                onToggleJD={() => setShowJD((v) => !v)}
                onScriptChange={handleScriptChange}
                focusedSceneId={focusedSceneId}
                onSceneFocus={setFocusedSceneId}
                canUndo={canUndo}
                canRedo={canRedo}
                onUndo={handleUndo}
                onRedo={handleRedo}
              />
            )}

            {/* Advanced Features Hub toggle */}
            <div className="shrink-0 border-t">
              <button
                type="button"
                className={cn(
                  "w-full flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
                  featuresOpen ? "text-primary bg-primary/5" : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setFeaturesOpen((v) => !v)}
              >
                {featuresOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                Advanced Studio Features
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/20 text-primary ml-2">
                  New
                </span>
              </button>
            </div>

            {/* Features Hub — fills remaining space when open */}
            {featuresOpen && (
              <div className="flex-1 overflow-hidden">
                <StudioFeaturesHub
                  projectId={state.projectId ?? undefined}
                  videoId={state.youtubeVideoId ?? undefined}
                  resumeText={state.resumeText}
                  scriptText={state.script?.scenes.map((s) =>
                    [s.title, s.subtitle, typeof s.text === "string" ? s.text : s.text?.join(" "), s.items?.join(". ")].filter(Boolean).join(". ")
                  ).join(" ") ?? ""}
                  scenes={state.script?.scenes.map((s) => ({
                    id: s.id,
                    title: s.title,
                    text: typeof s.text === "string" ? s.text : s.text?.join(" "),
                    items: s.items,
                    skills: s.skills,
                  }))}
                  videoBlob={state.videoBlob}
                  videoUrl={state.youtubeVideoId ? `https://www.youtube.com/watch?v=${state.youtubeVideoId}` : undefined}
                  videoDurationSec={state.script?.video.duration}
                  candidateName={state.name}
                />
              </div>
            )}
          </div>

          {/* Right panel — export/publish actions + settings */}
          <div className="studio-right-panel">
            <StudioPreview
              state={state}
              compiledVideo={compiledVideo}
              playing={playing}
              currentTime={currentTime}
              exportProgress={exportProgress}
              onPlayPause={() => setPlaying((p) => !p)}
              onTimeUpdate={setCurrentTime}
              onExport={handleExport}
              onPublish={handlePublish}
              onPublishToProfile={handlePublishToProfile}
              isPublishedToProfile={isPublishedToProfile}
              profileUrl={user?.id ? `/people/${user.id}` : undefined}
              onLinkedInPost={() => setLinkedInOpen(true)}
              onMakePublic={handleMakePublic}
              isPublic={isPublic}
              onGenerate={handleGenerate}
              showVideo={false}
            />
            <StudioSettings state={state} onStateChange={patchState} />
          </div>
        </div>
      </div>

      {linkedInOpen && (state.youtubeVideoId || state.projectId) && (
        <LinkedInPostModal
          videoId={state.youtubeVideoId ?? state.projectId!}
          videoTitle={state.name}
          onClose={() => setLinkedInOpen(false)}
        />
      )}

      {/* First-time onboarding overlay */}
      {onboardingStep >= 0 && (() => {
        const steps = [
          {
            title: "Welcome to Video Studio!",
            body: "Create a professional video resume in minutes. Start by pasting your resume or job description in the Prompt tab.",
            icon: <Sparkles className="h-8 w-8 text-primary" />,
          },
          {
            title: "Generate Your Script",
            body: "Click 'Generate Script' on the right panel. Our AI will write a compelling script tailored to your background and target role.",
            icon: <Zap className="h-8 w-8 text-primary" />,
          },
          {
            title: "Preview & Customise",
            body: "Your video preview updates live. Drag the divider below the video to resize it. Switch to the Storyboard tab to edit individual scenes.",
            icon: <Play className="h-8 w-8 text-primary" />,
          },
          {
            title: "Export & Share",
            body: "When happy with your video, export as MP4 or publish directly to your profile. You can also post to LinkedIn or YouTube.",
            icon: <Share2 className="h-8 w-8 text-primary" />,
          },
        ];
        const step = steps[onboardingStep];
        const isLast = onboardingStep === steps.length - 1;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-background rounded-xl shadow-2xl p-8 max-w-md w-full mx-4 space-y-4">
              <div className="flex flex-col items-center text-center gap-3">
                {step.icon}
                <h2 className="text-2xl font-bold">{step.title}</h2>
                <p className="text-muted-foreground">{step.body}</p>
              </div>
              <div className="flex items-center justify-between pt-2">
                <div className="flex gap-1.5">
                  {steps.map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "w-2 h-2 rounded-full transition-colors",
                        i === onboardingStep ? "bg-primary" : "bg-muted-foreground/30"
                      )}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      localStorage.setItem("studio_onboarded", "1");
                      setOnboardingStep(-1);
                    }}
                  >
                    Skip
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      if (isLast) {
                        localStorage.setItem("studio_onboarded", "1");
                        setOnboardingStep(-1);
                      } else {
                        setOnboardingStep((s) => s + 1);
                      }
                    }}
                  >
                    {isLast ? "Get Started" : "Next"}
                    {!isLast && <ChevronRight className="ml-1 h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
