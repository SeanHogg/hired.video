// StudioLayout.tsx — top-level state owner for the 3-panel Studio workspace.
// Unauthenticated users see a marketing landing. Authenticated users get the
// full workspace.

import { useState, useCallback, useEffect, useRef, lazy, Suspense } from "react";
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
import { migrateScriptToElements } from "@/lib/compiler/legacy-to-elements";
import { exportVideo } from "@/lib/renderer/video-exporter";
import type { StudioProjectState } from "@/types/studio";
import type { VideoScript } from "@/types/video-script";
import NLETimeline from "@/components/studio/NLETimeline";
import type { CompiledVideo } from "@/lib/compiler/types";
import { defaultStudioState } from "@/types/studio";

import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";

import StudioSidebar, { type ContentTemplate } from "./StudioSidebar";
import StudioEditor, { type EditorTab } from "./StudioEditor";
import StudioPreview from "./StudioPreview";
import StudioWizard from "./StudioWizard";
import StudioActionBar from "./StudioActionBar";
import TimelineEditor from "@/components/TimelineEditor";

const LinkedInPublisher = lazy(() => import("@/components/studio/LinkedInPublisher"));

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
    videoUrl: null,
    thumbnailUrl: null,
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
  /** True after the user has actually used a Step 3 share action. Reset on
   *  Create New / load project, set when the user clicks any share button. */
  const [hasShared, setHasShared] = useState(false);
  const [linkedInPublishOpen, setLinkedInPublishOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  /** Tracks whether we've already attempted the auto-load-latest-or-open-wizard
   *  bootstrap, so it only runs once per studio session. */
  const [bootstrapped, setBootstrapped] = useState(false);
  const [contentTemplate, setContentTemplate] = useState<ContentTemplate>("resume");
  const [focusedSceneId, setFocusedSceneId] = useState<string | undefined>();
  /** Element selected for editing — drives both the canvas overlay highlight
   *  and the inline editor inside the storyboard scene card. */
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

  // Auto-focus the first scene when a script becomes available, so the Stock
  // Media panel has a target. The user can click any other scene to switch.
  // Also clears focus if the focused scene no longer exists (e.g. after regenerate).
  const [isSaving, setIsSaving] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
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
    studioService.getProjects()
      .then((r) => {
        const list = r.data ?? [];
        setProjects(list);
        // ── Bootstrap: on first load, either auto-open the latest project, or
        //    pop the wizard for first-time users. Only runs once per session.
        if (!bootstrapped) {
          setBootstrapped(true);
          if (list.length > 0) {
            // Pick most recently updated (createdAt fallback)
            const latest = [...list].sort((a, b) => {
              const ta = new Date(a.updateDateTime ?? a.creationDateTime).getTime();
              const tb = new Date(b.updateDateTime ?? b.creationDateTime).getTime();
              return tb - ta;
            })[0];
            if (latest) handleProjectSelect(latest);
          } else {
            setWizardOpen(true);
          }
        }
      })
      .catch(() => {
        // On fetch failure, still allow first-time users into the wizard.
        if (!bootstrapped) {
          setBootstrapped(true);
          setWizardOpen(true);
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Sync focused scene to current script — auto-focus first scene if none, or
  // clear stale focus when the script no longer contains the focused id.
  useEffect(() => {
    const scenes = state.script?.scenes;
    if (!scenes || scenes.length === 0) {
      if (focusedSceneId !== undefined) setFocusedSceneId(undefined);
      return;
    }
    if (!focusedSceneId || !scenes.some((s) => s.id === focusedSceneId)) {
      setFocusedSceneId(scenes[0].id);
    }
  }, [state.script, focusedSceneId]);

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
        purpose: state.purpose,
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

      // Migrate legacy fields → sceneElements so the editor shows the unified
      // element gallery from first paint. The backend generator still emits
      // legacy title/subtitle/text/etc; we convert them client-side.
      script = migrateScriptToElements(script) as typeof script;

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
  // Step 2: render the video and upload it to R2 in one go. Downloading a
  // local copy is now an optional, separate action (handleDownloadLocal).

  async function handleExport() {
    if (!compiledVideo) return;
    patchState({ status: "exporting" });
    setExportProgress(0);

    // Migrate legacy scenes to the new sceneElements model on first export.
    // This is a one-way migration so users editing legacy projects get the
    // new unified element controls. The compiler keeps rendering correctly
    // because element nodes inherit the same canonical layout positions.
    let workingScript = state.script;
    if (workingScript) {
      const needsMigration = workingScript.scenes.some(
        (s) => !s.sceneElements || s.sceneElements.length === 0,
      );
      if (needsMigration) {
        const migrated = migrateScriptToElements(workingScript);
        workingScript = migrated as typeof workingScript;
        patchState({ script: workingScript });
        recompile(workingScript);
      }
    }

    try {
      // 1. Render the canvas to a blob (in-memory)
      const blob = await exportVideo(compiledVideo, {
        onProgress: (p) => setExportProgress(p * 0.6), // first 60% = render
        audio: workingScript?.video?.audio,
        voiceover: state.voiceover,
        sceneTimings: workingScript?.scenes.map((s) => ({ id: s.id, start: s.start })),
      });
      patchState({ videoBlob: blob, status: "uploading" });
      setExportProgress(0.65);

      // 2. Upload to R2 immediately so the user keeps the result after refresh
      const uploadRes = await studioService.uploadVideo(
        blob,
        state.name,
        state.projectId ?? undefined,
        state.resumeId,
        state.resolution,
      );
      if (!uploadRes.data) throw new Error("Upload failed");

      // 3. Persist the hosted URL into state so Step 3 (Share) keeps working
      // after a page refresh (because it'll be re-restored from p.videoUrl).
      patchState({
        projectId: uploadRes.data.id,
        videoUrl: uploadRes.data.videoUrl ?? null,
        thumbnailUrl: uploadRes.data.thumbnailUrl ?? null,
        status: "ready",
      });
      setExportProgress(1);

      // The upload endpoint marks the project status as "published" so it
      // immediately appears on the user's profile page.
      setIsPublishedToProfile(true);

      // 4. Refresh the recent projects list so the new entry appears
      setProjects((prev) => {
        const without = prev.filter((p) => p.id !== uploadRes.data!.id);
        return [uploadRes.data!, ...without];
      });

      toast({ title: "Video ready", description: "Saved to your library and published to your profile." });
    } catch (e: unknown) {
      patchState({ status: "error" });
      const msg = String(e);
      if (/PREMIUM_REQUIRED/i.test(msg)) {
        toast({ title: "Premium required", description: "4K export requires a Premium subscription.", variant: "destructive" });
      } else if (/QUOTA_EXCEEDED/i.test(msg)) {
        toast({ title: "Free limit reached", description: "Free accounts can publish 1 video. Upgrade for unlimited.", variant: "destructive" });
      } else {
        toast({ title: "Export failed", description: msg, variant: "destructive" });
      }
    }
  }

  // ── Download local copy (optional, post-export) ────────────────────────────

  function handleDownloadLocal() {
    // Prefer the in-memory blob (fresh export); fall back to the hosted URL.
    if (state.videoBlob) {
      const ext = state.videoBlob.type.includes("webm") ? "webm" : "mp4";
      const url = URL.createObjectURL(state.videoBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${state.name.replace(/\s+/g, "-")}.${ext}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      return;
    }
    if (state.videoUrl) {
      // Open the hosted URL in a new tab — the browser will download it
      window.open(state.videoUrl, "_blank", "noopener,noreferrer");
    }
  }

  // ── Publish to YouTube ─────────────────────────────────────────────────────

  async function handlePublish() {
    if (!state.projectId) return;
    patchState({ status: "publishing" });
    setHasShared(true);

    try {
      const pubRes = await studioService.publishVideo(
        state.projectId,
        { title: state.name, description: "", privacyStatus: isPublic ? "public" : "unlisted" },
        state.resumeId,
      );
      if (!pubRes.data) throw new Error("Publish failed");

      patchState({
        youtubeVideoId: pubRes.data.youtubeVideoId,
        status: "done",
      });
      toast({ title: "Published to YouTube!", description: "Your video is live." });
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
    setIsPublishedToProfile(false);
    setHasShared(false);
    setContentTemplate("resume");
  }

  function handleProjectSelect(p: import("@/lib/services/studio-service").StudioProject) {
    // Migrate legacy fields → sceneElements on load so the editor shows the
    // unified element gallery for projects saved before the refactor.
    const script = p.script ? (migrateScriptToElements(p.script) as VideoScript) : null;
    const cv = script ? recompile(script) : null;
    // Restore purpose — check saved _purpose, then video.purpose, fallback to "resume"
    const savedPurpose = (p.purpose ?? script?.video?.purpose ?? "resume") as typeof state.purpose;
    // Map purpose back to content template
    const purposeToTemplate: Record<string, ContentTemplate> = {
      resume: "resume", job_ad: "job_ad", company_promo: "job_ad",
      recruiter_brand: "job_ad", product_launch: "job_ad", personal_brand: "personal_brand",
    };
    setContentTemplate(purposeToTemplate[savedPurpose] ?? "resume");
    setState({
      ...makeInitialState(),
      name: p.title,
      projectId: p.id,
      youtubeVideoId: p.youtubeVideoId ?? null,
      // Restore the persisted hosted URL so users keep their published video
      // after a refresh — Step 3 (Share) needs this.
      videoUrl: p.videoUrl ?? null,
      thumbnailUrl: p.thumbnailUrl ?? null,
      script,
      resumeText: p.resumeText ?? "",
      prompt: p.prompt ?? defaultStudioState.prompt,
      jobDescription: p.jobDescription ?? "",
      purpose: savedPurpose,
      ...(script?._meta?.model ? { model: script._meta.model } : {}),
    });
    setCompiledVideo(cv);
    setIsPublishedToProfile(p.status === "Published");
    setIsPublic(p.isPublic ?? false);
    // Loading a project doesn't count as a fresh share — leave the Step 3
    // checkmark off until the user actually clicks a share action.
    setHasShared(false);
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
    if (pub) setHasShared(true);
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

  function handleContentTemplateSelect(template: ContentTemplate) {
    setContentTemplate(template);
    // Map content template to API purpose + set sensible defaults
    const config: Record<ContentTemplate, { purpose: typeof state.purpose; name: string; prompt: string }> = {
      "resume":         { purpose: "resume",         name: "New Video Resume",    prompt: "Create a professional 28-second video resume" },
      "skills-demo":    { purpose: "resume",         name: "Skills Demo",         prompt: "Create a skills demonstration video showcasing technical expertise" },
      "job_ad":         { purpose: "job_ad",         name: "Job Ad Video",        prompt: "Create a compelling 30-second job advertisement video" },
      "personal_brand": { purpose: "personal_brand", name: "Personal Brand Video", prompt: "Create a personal brand video that tells my story" },
    };
    const c = config[template] ?? config.resume;
    patchState({ purpose: c.purpose, name: c.name, prompt: c.prompt });
  }

  async function handlePublishToProfile() {
    // The Generate Video step already uploads + marks the project published.
    // This handler is a safety net for projects loaded from a draft state, or
    // for re-publishing after the user toggled the project back to draft.
    if (!state.projectId) {
      toast({ title: "Generate the video first", description: "Use Step 2 to render and publish your video." });
      return;
    }
    try {
      const res = await studioService.updateProjectStatus(state.projectId, "published");
      if (res.data) {
        setProjects((prev) => {
          const without = prev.filter((p) => p.id !== res.data!.id);
          return [res.data!, ...without];
        });
        setIsPublishedToProfile(true);
        setHasShared(true);
        toast({ title: "Published to profile!", description: "Your video is now visible on your profile." });
      }
    } catch (e: unknown) {
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

  // ── Autosave + version history (gap #131) ──────────────────────────────────
  // Debounced 30s after the last script mutation, snapshot the current
  // storyboard into `studio_project_versions`. The route enforces 50-version
  // cap + 30-day retention server-side.
  const lastSnapshotRef = useRef<string>("");
  useEffect(() => {
    if (!state.projectId || !state.script) return;
    const serialized = JSON.stringify(state.script);
    if (serialized === lastSnapshotRef.current) return;
    const handle = window.setTimeout(() => {
      lastSnapshotRef.current = serialized;
      import("@/lib/services/studio-features-service").then(({ createProjectVersion }) =>
        createProjectVersion(state.projectId!, state.script, { isAutosave: true }).catch(() => {}),
      );
    }, 30_000);
    return () => window.clearTimeout(handle);
  }, [state.projectId, state.script]);

  // ── Element overlay helpers ──────────────────────────────────────────────
  // The currently focused scene drives the canvas drag-overlay so users can
  // edit the elements they're working on. Falls back to the scene at the
  // current playback time if no scene is explicitly focused.
  const overlayScene = state.script?.scenes.find((s) => s.id === focusedSceneId)
    ?? state.script?.scenes.find((s) => currentTime >= s.start && currentTime < s.start + s.duration)
    ?? state.script?.scenes[0]
    ?? null;

  function handleUpdateElementBox(elementId: string, box: import("@/types/video-script").ElementBox) {
    if (!state.script || !overlayScene) return;
    const next = {
      ...state.script,
      scenes: state.script.scenes.map((s) =>
        s.id === overlayScene.id
          ? {
              ...s,
              sceneElements: (s.sceneElements ?? []).map((el) =>
                el.id === elementId ? { ...el, box } : el,
              ),
            }
          : s,
      ),
    };
    handleScriptChange(next);
  }

  /** Selecting an element on the canvas also focuses its scene so the
   *  storyboard sidebar opens the right card editor. */
  function handleSelectElement(id: string | null) {
    setSelectedElementId(id);
    if (id && overlayScene && overlayScene.id !== focusedSceneId) {
      setFocusedSceneId(overlayScene.id);
    }
  }

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
        state.purpose,
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
            onOpenWizard={() => { handleCreateNew(); setWizardOpen(true); }}
            onProjectSelect={handleProjectSelect}
            onDeleteProject={handleDeleteProject}
            onTemplateLoad={handleTemplateLoad}
            onBackgroundSelect={handleBackgroundSelect}
            script={state.script}
            onScriptChange={handleScriptChange}
            contentTemplate={contentTemplate}
            onContentTemplateSelect={handleContentTemplateSelect}
            focusedSceneId={focusedSceneId}
            state={state}
            onStateChange={patchState}
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
                onLinkedInPublish={() => { setLinkedInPublishOpen(true); setHasShared(true); }}
                onMakePublic={handleMakePublic}
                isPublic={isPublic}
                onDownloadLocal={handleDownloadLocal}
                hasShared={hasShared}
                overlayElements={overlayScene?.sceneElements}
                selectedElementId={selectedElementId}
                onSelectElement={handleSelectElement}
                onUpdateElementBox={handleUpdateElementBox}
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
                  <NLETimeline
                    script={state.script}
                    onScriptChange={handleScriptChange}
                    currentTime={currentTime}
                    onSeek={(t) => { setCurrentTime(t); setPlaying(false); }}
                  />
                ) : (
                  <div className="px-5 py-3 text-xs text-muted-foreground">
                    Generate a script to see the timeline
                  </div>
                )
              )}
            </div>

            {/* Prompt / Storyboard / Actions editor — same flow for all templates */}
            <StudioEditor
              actionBar={
                <StudioActionBar
                  state={state}
                  compiledVideo={compiledVideo}
                  exportProgress={exportProgress}
                  hasShared={hasShared}
                  isPublic={isPublic}
                  isPublishedToProfile={isPublishedToProfile}
                  profileUrl={user?.id ? `/people/${user.id}` : undefined}
                  onGenerate={handleGenerate}
                  onExport={handleExport}
                  onPublish={handlePublish}
                  onPublishToProfile={handlePublishToProfile}
                  onLinkedInPublish={() => { setLinkedInPublishOpen(true); setHasShared(true); }}
                  onMakePublic={handleMakePublic}
                  onDownloadLocal={handleDownloadLocal}
                />
              }
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
              contentTemplate={contentTemplate}
              selectedElementId={selectedElementId}
              onSelectedElementChange={setSelectedElementId}
              currentTimeSec={currentTime}
              videoUrl={null}
              onRestoreVersion={(storyboard) => {
                const restored = storyboard as VideoScript | null;
                if (restored) {
                  pushHistory(restored);
                  patchState({ script: restored });
                  recompile(restored);
                  toast({ title: "Version restored", description: "Storyboard rolled back to selected version." });
                }
              }}
              onApplyRewrite={(scenes) => {
                if (!state.script) return;
                const updated = { ...state.script, scenes: scenes as any } as VideoScript;
                pushHistory(updated);
                patchState({ script: updated });
                recompile(updated);
                toast({ title: "Script rewritten", description: `${scenes.length} scenes applied.` });
              }}
              onApplyHook={(patch) => {
                if (!state.script || state.script.scenes.length === 0) return;
                const next = {
                  ...state.script,
                  scenes: state.script.scenes.map((s, i) =>
                    i === 0 ? { ...s, ...patch } : s,
                  ),
                } as VideoScript;
                pushHistory(next);
                patchState({ script: next });
                recompile(next);
                toast({ title: "Hook applied", description: "Scene 0 updated with new hook." });
              }}
              onVoiceoverGenerated={(results) => {
                // Store voiceover results keyed by scene ID
                const scenes: Record<string, { audioUrl: string | null; durationMs: number; wordTimestamps: Array<{ word: string; start: number; end: number }> }> = {};
                for (const r of results) {
                  scenes[r.sceneId] = { audioUrl: r.audioUrl, durationMs: r.durationMs, wordTimestamps: r.wordTimestamps };
                }
                patchState({
                  voiceover: {
                    enabled: true,
                    voiceId: state.voiceover?.voiceId ?? "browser-default",
                    voiceName: state.voiceover?.voiceName ?? "Default",
                    speed: state.voiceover?.speed ?? 1,
                    scenes,
                  },
                });
                toast({ title: "Voiceover added", description: `${results.length} scene(s) ready for export.` });
              }}
              onVoiceConfigChange={(cfg) => {
                // Keep the global voiceover config in sync with the picker so
                // VideoPreview's TTS playback uses the engine + voice the user
                // selected (and so the export pipeline picks up the right
                // engine when it renders the final audio track).
                patchState({
                  voiceover: {
                    enabled: state.voiceover?.enabled ?? true,
                    engine: cfg.engine,
                    voiceId: cfg.voiceId,
                    voiceName: cfg.voiceName,
                    speed: cfg.speed,
                    scenes: state.voiceover?.scenes ?? {},
                  },
                });
              }}
            />
          </div>

        </div>
      </div>

      <StudioWizard
        open={wizardOpen}
        state={state}
        onStateChange={patchState}
        contentTemplate={contentTemplate}
        onContentTemplateSelect={handleContentTemplateSelect}
        onTemplateLoad={handleTemplateLoad}
        onBackgroundSelect={handleBackgroundSelect}
        onGenerate={handleGenerate}
        onClose={() => setWizardOpen(false)}
      />

      {linkedInPublishOpen && state.projectId && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-card border rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-semibold">Publish to LinkedIn</h2>
              <button type="button" onClick={() => setLinkedInPublishOpen(false)} className="text-muted-foreground hover:text-foreground">
                <span className="sr-only">Close</span>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-5">
              <Suspense fallback={<div className="text-center py-8 text-muted-foreground text-sm">Loading…</div>}>
                <LinkedInPublisher
                  projectId={state.projectId}
                  videoBlob={state.videoBlob}
                  defaultText={state.script?.scenes.map((s) =>
                    [s.title, typeof s.text === "string" ? s.text : ""].filter(Boolean).join(". ")
                  ).join(" ").slice(0, 200) ?? ""}
                  onPublished={() => {
                    setLinkedInPublishOpen(false);
                    toast({ title: "Published to LinkedIn!" });
                  }}
                />
              </Suspense>
            </div>
          </div>
        </div>
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
