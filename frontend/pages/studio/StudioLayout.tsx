// StudioLayout.tsx — top-level state owner for the 3-panel Studio workspace.
// Unauthenticated users see a marketing landing. Authenticated users get the
// full workspace.

import { useState, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
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

import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import StudioSidebar from "./StudioSidebar";
import StudioEditor, { type EditorTab } from "./StudioEditor";
import StudioPreview from "./StudioPreview";
import StudioSettings from "./StudioSettings";
import TimelineEditor from "@/components/TimelineEditor";
import LinkedInPostModal from "@/components/LinkedInPostModal";

function makeInitialState(): StudioProjectState {
  return {
    ...defaultStudioState,
    script: null,
    compiledVideo: null,
    videoBlob: null,
    projectId: null,
    youtubeVideoId: null,
  };
}

function Landing() {
  return (
    <div className="flex h-screen items-center justify-center flex-col gap-6 text-center px-4">
      <Sparkles className="w-12 h-12 text-primary" />
      <h1 className="text-3xl font-bold">hired.video Studio</h1>
      <p className="text-muted-foreground max-w-md">
        Turn your resume into a shareable professional video in under 60 seconds.
        Sign in to get started.
      </p>
      <Link to="/login">
        <Button size="lg">Sign in to Start Creating</Button>
      </Link>
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
  const [linkedInOpen, setLinkedInOpen] = useState(false);
  const [focusedSceneId, setFocusedSceneId] = useState<string | undefined>();

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

      const script = res.data;
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
    setState(makeInitialState());
    setCompiledVideo(null);
    setTab("prompt");
    setCurrentTime(0);
    setPlaying(false);
    setIsPublic(false);
  }

  function handleProjectSelect(p: import("@/lib/services/studio-service").StudioProject) {
    const script = p.storyboard
      ? null // old storyboard format; we'll rely on re-generation
      : null;
    setState({
      ...makeInitialState(),
      name: p.title,
      projectId: p.id,
      youtubeVideoId: p.youtubeVideoId,
      script,
    });
    setCompiledVideo(null);
    setTab("prompt");
  }

  function handleTemplateLoad(script: VideoScript) {
    const cv = recompile(script);
    patchState({ script, status: cv ? "ready" : "error" });
    setCompiledVideo(cv);
    setTab("storyboard");
  }

  function handleMakePublic(pub: boolean) {
    setIsPublic(pub);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <Landing />
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
            onCreateNew={handleCreateNew}
            onProjectSelect={handleProjectSelect}
            onTemplateLoad={handleTemplateLoad}
          />

          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
            {/* Video preview — fills center width, height set by 16:9 aspect ratio */}
            <div className="shrink-0 border-b">
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
                onLinkedInPost={() => setLinkedInOpen(true)}
                onMakePublic={handleMakePublic}
                isPublic={isPublic}
                showActions={false}
                className="w-full"
              />
            </div>

            {/* Timeline — always visible; shows placeholder until script is generated */}
            <div className="shrink-0 border-b">
              {state.script ? (
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
              )}
            </div>

            {/* Prompt / Storyboard tabs — fills remaining space */}
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
            />
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

      {linkedInOpen && state.youtubeVideoId && (
        <LinkedInPostModal
          videoId={state.youtubeVideoId}
          videoTitle={state.name}
          onClose={() => setLinkedInOpen(false)}
        />
      )}
    </div>
  );
}
