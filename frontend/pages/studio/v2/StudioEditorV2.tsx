/**
 * v2 Studio editor shell at `/studio/:id`.
 *
 * Layout:
 *   ┌─────────┬──────────────────────────┬──────────┐
 *   │ Scenes  │                          │          │
 *   │  rail   │   Canvas stage (zoom)    │ Props    │
 *   ├─────────┤                          │  panel   │
 *   │ Widgets │                          │          │
 *   │ palette │  Timeline (bottom)       │          │
 *   └─────────┴──────────────────────────┴──────────┘
 *
 * Persistence: the editor holds CanvasState in memory, autosaves to
 * localStorage on every change (scoped to the project id), and pushes
 * Timeline JSON to the server via studioService.saveDraft on a debounced
 * cadence. The server stores `timelineSpec`; the round-trip back is via
 * timelineToCanvasState() so a project saved here re-opens identically.
 *
 * Authorization: this surface is rendered inside the same auth wrapper
 * as the classic editor. Mutations route through the existing studio
 * routes — server enforces canActFor.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Save, Eye, Share2, ChevronUp, ChevronDown, Play, Pause, SkipBack } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { studioService } from "@/lib/services/studio-service";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { cn } from "@/lib/utils";

import {
  type CanvasState,
  type Scene,
  type Widget,
  type WidgetKind,
  type WidgetParams,
  type WidgetPosition,
  applyThemeToState,
  defaultWidget,
  emptyScene,
  totalDurationSeconds,
} from "@/lib/studio/editor-v2/canvas-state";
import {
  canvasStateToTimeline,
  timelineToCanvasState,
} from "@/lib/studio/editor-v2/timeline-emit";
import { seedCanvasFromTemplate } from "@/lib/studio/editor-v2/template-seeds";
import { usePreviewPlayback } from "@/lib/studio/editor-v2/use-preview-playback";

import ScenesRail from "@/components/studio/v2/ScenesRail";
import WidgetPalette from "@/components/studio/v2/WidgetPalette";
import CanvasStage, { type Selection } from "@/components/studio/v2/CanvasStage";
import PropertiesPanel from "@/components/studio/v2/PropertiesPanel";
import ZoomControl from "@/components/studio/v2/ZoomControl";
import EditorVersionToggle from "@/components/studio/v2/EditorVersionToggle";
import AdvancedTimeline from "@/components/studio/v2/AdvancedTimeline";
import DesignPanel from "@/components/studio/v2/DesignPanel";

const LOCAL_STORAGE_PREFIX = "studio.v2.draft.";
const AUTOSAVE_DEBOUNCE_MS = 800;

export default function StudioEditorV2() {
  const { id: routeId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const projectId = routeId ?? "new";
  // `?contentTemplate=` matches the chooser's emit + classic editor convention.
  // `?template=` was the original v2 param; keep it as a fallback so any v2
  // bookmarks made during the beta still resolve to the right seed.
  const templateHint =
    searchParams.get("contentTemplate") ?? searchParams.get("template");

  const [state, setState] = useState<CanvasState>(() =>
    hydrateInitialState(projectId, templateHint),
  );
  const [title, setTitle] = useState<string>("Untitled video");
  const [persistedProjectId, setPersistedProjectId] = useState<string | null>(
    projectId === "new" ? null : projectId,
  );
  const [activeSceneId, setActiveSceneId] = useState<string>(state.scenes[0].id);
  const [selection, setSelection] = useState<Selection>({
    kind: "scene",
    sceneId: state.scenes[0].id,
  });
  const [zoom, setZoom] = useState<number>(0.5);
  const [saving, setSaving] = useState(false);
  const [advancedTimelineOpen, setAdvancedTimelineOpen] = useState(false);
  const [leftTab, setLeftTab] = useState<"widgets" | "design">("widgets");
  const playback = usePreviewPlayback(state);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  const stageContainerRef = useRef<HTMLDivElement>(null);

  // Server-load when we have a real project id.
  useEffect(() => {
    if (projectId === "new") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await studioService.getProject(projectId);
        if (cancelled) return;
        const project = res.data;
        if (!project) {
          toast({
            title: "Project not found",
            description: "It may have been deleted or you don't have access.",
            variant: "destructive",
          });
          return;
        }
        setTitle(project.title);
        setPersistedProjectId(project.id);
        const spec = project.timelineSpec;
        if (spec) {
          const hydrated = timelineToCanvasState(spec);
          setState(hydrated);
          setActiveSceneId(hydrated.scenes[0].id);
          setSelection({ kind: "scene", sceneId: hydrated.scenes[0].id });
        }
      } catch (err) {
        toast({
          title: "Couldn't load project",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, toast]);

  // Local autosave so unsaved work survives reloads.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handle = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          LOCAL_STORAGE_PREFIX + projectId,
          JSON.stringify({ title, state }),
        );
      } catch {
        // Quota / private-mode — drop silently.
      }
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [projectId, title, state]);

  const fitZoom = useCallback(() => {
    const el = stageContainerRef.current;
    if (!el) return;
    const padding = 40;
    const availW = el.clientWidth - padding;
    const availH = el.clientHeight - padding;
    if (availW <= 0 || availH <= 0) return;
    const z = Math.min(availW / state.width, availH / state.height);
    setZoom(Math.max(0.1, Math.min(3, z)));
  }, [state.width, state.height]);

  // Auto-fit zoom to the available stage area whenever it changes.
  useEffect(() => {
    fitZoom();
  }, [fitZoom]);

  // During playback, follow the playhead — switch the active scene when
  // the playhead crosses a scene boundary. We don't touch activeSceneId
  // when paused so manual scene clicks still win.
  useEffect(() => {
    if (!playback.isPlaying) return;
    if (!playback.activeSceneIdAtPlayhead) return;
    if (playback.activeSceneIdAtPlayhead === activeSceneId) return;
    setActiveSceneId(playback.activeSceneIdAtPlayhead);
  }, [playback.isPlaying, playback.activeSceneIdAtPlayhead, activeSceneId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    function onResize() {
      fitZoom();
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [fitZoom]);

  // ───── Mutators (single source of truth — every consumer goes through here)
  const activeScene = useMemo<Scene>(() => {
    return (
      state.scenes.find((s) => s.id === activeSceneId) ?? state.scenes[0]
    );
  }, [state, activeSceneId]);

  const updateScene = useCallback(
    (sceneId: string, patch: Partial<Scene>) => {
      setState((prev) => ({
        ...prev,
        scenes: prev.scenes.map((s) => (s.id === sceneId ? { ...s, ...patch } : s)),
      }));
    },
    [],
  );

  const addScene = useCallback(() => {
    setState((prev) => {
      const next = emptyScene(`Scene ${prev.scenes.length + 1}`);
      return { ...prev, scenes: [...prev.scenes, next] };
    });
  }, []);

  const deleteScene = useCallback(
    (sceneId: string) => {
      setState((prev) => {
        if (prev.scenes.length <= 1) return prev;
        const next = prev.scenes.filter((s) => s.id !== sceneId);
        return { ...prev, scenes: next };
      });
      setActiveSceneId((current) => {
        if (current !== sceneId) return current;
        const remaining = state.scenes.filter((s) => s.id !== sceneId);
        return remaining[0]?.id ?? current;
      });
      setSelection((current) => {
        if (current.kind === "widget" && current.sceneId === sceneId) {
          const remaining = state.scenes.filter((s) => s.id !== sceneId);
          return { kind: "scene", sceneId: remaining[0]?.id ?? sceneId };
        }
        if (current.kind === "scene" && current.sceneId === sceneId) {
          const remaining = state.scenes.filter((s) => s.id !== sceneId);
          return { kind: "scene", sceneId: remaining[0]?.id ?? sceneId };
        }
        return current;
      });
    },
    [state.scenes],
  );

  const reorderScenes = useCallback((nextOrderIds: string[]) => {
    setState((prev) => {
      const byId = new Map(prev.scenes.map((s) => [s.id, s]));
      return {
        ...prev,
        scenes: nextOrderIds
          .map((id) => byId.get(id))
          .filter((s): s is Scene => Boolean(s)),
      };
    });
  }, []);

  const insertWidget = useCallback(
    (kind: WidgetKind, atFraction?: { x: number; y: number }) => {
      const widget: Widget = defaultWidget(kind);
      if (atFraction) {
        widget.position = {
          ...widget.position,
          x: Math.max(0, Math.min(1 - widget.position.width, atFraction.x - widget.position.width / 2)),
          y: Math.max(0, Math.min(1 - widget.position.height, atFraction.y - widget.position.height / 2)),
        };
      }
      setState((prev) => ({
        ...prev,
        scenes: prev.scenes.map((s) =>
          s.id === activeSceneId
            ? {
                ...s,
                widgets: [
                  ...s.widgets,
                  { ...widget, position: { ...widget.position, z: s.widgets.length + 1 } },
                ],
              }
            : s,
        ),
      }));
      setSelection({ kind: "widget", sceneId: activeSceneId, widgetId: widget.id });
    },
    [activeSceneId],
  );

  const updateWidgetPosition = useCallback(
    (widgetId: string, position: WidgetPosition) => {
      setState((prev) => ({
        ...prev,
        scenes: prev.scenes.map((scene) => ({
          ...scene,
          widgets: scene.widgets.map((w) =>
            w.id === widgetId ? { ...w, position } : w,
          ),
        })),
      }));
    },
    [],
  );

  const updateWidgetParams = useCallback(
    (widgetId: string, params: WidgetParams) => {
      setState((prev) => ({
        ...prev,
        scenes: prev.scenes.map((scene) => ({
          ...scene,
          widgets: scene.widgets.map((w) =>
            w.id === widgetId ? { ...w, params } : w,
          ),
        })),
      }));
    },
    [],
  );

  const updateWidgetWindow = useCallback(
    (widgetId: string, visibleFrom: number | null, visibleTo: number | null) => {
      setState((prev) => ({
        ...prev,
        scenes: prev.scenes.map((scene) => ({
          ...scene,
          widgets: scene.widgets.map((w) =>
            w.id === widgetId ? { ...w, visibleFrom, visibleTo } : w,
          ),
        })),
      }));
    },
    [],
  );

  const deleteWidget = useCallback((widgetId: string) => {
    setState((prev) => ({
      ...prev,
      scenes: prev.scenes.map((scene) => ({
        ...scene,
        widgets: scene.widgets.filter((w) => w.id !== widgetId),
      })),
    }));
    setSelection((current) =>
      current.kind === "widget" && current.widgetId === widgetId
        ? { kind: "scene", sceneId: activeSceneId }
        : current,
    );
  }, [activeSceneId]);

  // ───── Save / publish
  async function handleSave() {
    setSaving(true);
    try {
      const timeline = canvasStateToTimeline(state);
      const res = await studioService.saveDraft({
        name: title,
        projectId: persistedProjectId ?? undefined,
        kind: "nle",
        timelineSpec: timeline,
      });
      if (res.data?.id) {
        setPersistedProjectId(res.data.id);
        if (projectId === "new") {
          navigate(`/studio/${encodeURIComponent(res.data.id)}`, { replace: true });
        }
      }
      toast({ title: "Saved" });
    } catch (err) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg font-medium">Sign in to use the Studio editor.</p>
        <Button onClick={() => navigate("/login")}>Sign in</Button>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
      />
      <div
        className={cn(
          // pt-16 reserves space for the app-wide <Navigation/>, which is
          // `position: fixed top-0 z-50`. Without it the EditorHeader below
          // would render behind the global nav and the user wouldn't see
          // the back/save/preview/share controls.
          "flex flex-1 flex-col pt-16 transition-all duration-300",
          sidebarCollapsed ? "lg:ml-16" : "lg:ml-80",
        )}
      >
        <Navigation
          onMenuClick={() => setSidebarOpen(true)}
          onSidebarToggle={() => setSidebarCollapsed((c) => !c)}
          sidebarCollapsed={sidebarCollapsed}
        />
        <EditorHeader
          title={title}
          onTitleChange={setTitle}
          onBack={() => navigate("/studio")}
          onSave={handleSave}
          saving={saving}
          playback={playback}
        />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* LEFT — scenes (top) + tabbed Add / Design panel (bottom). The
              bottom panel hosts the widget palette and the shared theme /
              background / music pickers behind tabs so the v2 user has
              parity with v1's sidebar sections. */}
          <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-card">
            <div className="h-2/5 min-h-[180px] border-b border-border">
              <ScenesRail
                scenes={state.scenes}
                activeSceneId={activeSceneId}
                onSelect={(id) => {
                  setActiveSceneId(id);
                  setSelection({ kind: "scene", sceneId: id });
                }}
                onAdd={addScene}
                onDelete={deleteScene}
                onReorder={reorderScenes}
              />
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <LeftTabs
                tab={leftTab}
                onChange={setLeftTab}
              />
              <div className="min-h-0 flex-1">
                {leftTab === "widgets" ? (
                  <WidgetPalette onInsert={(kind) => insertWidget(kind)} />
                ) : (
                  <DesignPanel
                    activeThemeId={state.themeId}
                    activeSceneBgValue={activeScene.backgroundColor}
                    activeMusicTrackId={state.musicTrackId}
                    onSelectTheme={(theme) =>
                      setState((prev) => applyThemeToState(prev, theme))
                    }
                    onSelectBackground={(preset) =>
                      updateScene(activeScene.id, {
                        backgroundColor: preset.solidColor,
                      })
                    }
                    onSelectMusic={(track) =>
                      setState((prev) => ({ ...prev, musicTrackId: track.id }))
                    }
                  />
                )}
              </div>
            </div>
          </aside>

          {/* CENTER — canvas + timeline. `min-w-0` is critical: without it
              flex children default to `min-width: auto`, which lets the
              canvas push the side panels out of the viewport when the user
              zooms past fit. With `min-w-0` the column stays bounded and
              the inner overflow-auto wrapper scrolls instead. */}
          <section className="flex min-w-0 flex-1 flex-col bg-muted/30">
            <div
              ref={stageContainerRef}
              className="relative min-h-0 flex-1 overflow-auto bg-muted/30 p-6"
            >
              <div className="flex min-h-full min-w-min items-center justify-center">
                <CanvasStage
                  scene={activeScene}
                  canvasWidth={state.width}
                  canvasHeight={state.height}
                  zoom={zoom}
                  selection={selection}
                  onSelect={setSelection}
                  onWidgetDrop={(kind, at) => insertWidget(kind, at)}
                  onWidgetMove={updateWidgetPosition}
                  playheadInScene={
                    playback.isPlaying &&
                    playback.activeSceneIdAtPlayhead === activeScene.id
                      ? playback.activeSceneElapsed
                      : null
                  }
                />
              </div>
              {/* Sticky inside the scrollable canvas viewport pins the zoom
                  control to the bottom-right of the *visible* area. An
                  absolute child of an overflow-auto container would scroll
                  with the content and disappear as soon as the canvas
                  exceeds the viewport. */}
              <div className="pointer-events-none sticky bottom-2 z-10 flex justify-end pr-2">
                <ZoomControl zoom={zoom} onChange={setZoom} onFit={fitZoom} />
              </div>
            </div>
            <TimelineDock
              state={state}
              activeSceneId={activeSceneId}
              selection={selection}
              advancedOpen={advancedTimelineOpen}
              onToggleAdvanced={() => setAdvancedTimelineOpen((open) => !open)}
              onSelectScene={(id) => {
                setActiveSceneId(id);
                setSelection({ kind: "scene", sceneId: id });
              }}
              onSelectWidget={(sceneId, widgetId) => {
                setActiveSceneId(sceneId);
                setSelection({ kind: "widget", sceneId, widgetId });
              }}
              onSceneDurationChange={(sceneId, durationSeconds) =>
                updateScene(sceneId, { durationSeconds })
              }
              onWidgetWindowChange={updateWidgetWindow}
            />
          </section>

          {/* RIGHT — properties panel */}
          <aside className="w-72 shrink-0 border-l border-border bg-card">
            <PropertiesPanel
              state={state}
              selection={selection}
              onUpdateScene={updateScene}
              onUpdateWidgetPosition={updateWidgetPosition}
              onUpdateWidgetParams={updateWidgetParams}
              onDeleteWidget={deleteWidget}
            />
          </aside>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Header — title field + back / save / preview buttons.
// ───────────────────────────────────────────────────────────────────────────

function EditorHeader({
  title,
  onTitleChange,
  onBack,
  onSave,
  saving,
  playback,
}: {
  title: string;
  onTitleChange: (next: string) => void;
  onBack: () => void;
  onSave: () => void;
  saving: boolean;
  playback: ReturnType<typeof usePreviewPlayback>;
}) {
  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    return `${m}:${r.toString().padStart(2, "0")}`;
  };
  return (
    <header className="flex items-center justify-between gap-4 border-b border-border bg-card px-4 py-2">
      <div className="flex flex-1 items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="gap-1 px-2"
          aria-label="Back to studio"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          className="h-8 max-w-xs border-transparent bg-transparent text-sm font-medium shadow-none focus-visible:border-border"
        />
      </div>
      {/* Playback controls — Play/Pause + scrubber + timecode. Drives the
          shared `usePreviewPlayback` hook so the canvas/widgets/scenes
          all see the same playhead (DRY). */}
      <div className="flex flex-1 items-center justify-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => playback.seek(0)}
          aria-label="Back to start"
          className="h-8 w-8 p-0"
        >
          <SkipBack className="h-4 w-4" />
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={playback.toggle}
          aria-label={playback.isPlaying ? "Pause preview" : "Play preview"}
          className="h-8 w-8 p-0"
        >
          {playback.isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </Button>
        <input
          type="range"
          min={0}
          max={Math.max(0.1, playback.duration)}
          step={0.05}
          value={playback.playhead}
          onChange={(e) => playback.seek(Number(e.target.value))}
          className="h-1 w-40 cursor-pointer accent-brand-purple"
          aria-label="Playhead"
        />
        <span className="min-w-[5.5rem] text-center text-[10px] tabular-nums text-muted-foreground">
          {fmt(playback.playhead)} / {fmt(playback.duration)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <EditorVersionToggle compact />
        <Button variant="outline" size="sm" className="gap-1" disabled>
          <Eye className="h-4 w-4" />
          Preview
        </Button>
        <Button variant="outline" size="sm" className="gap-1" disabled>
          <Share2 className="h-4 w-4" />
          Share
        </Button>
        <Button size="sm" className="gap-1" onClick={onSave} disabled={saving}>
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </header>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// TimelineDock — the always-visible scene strip plus a collapsible
// AdvancedTimeline (multi-track view). Per the user's brief: "Timeline
// and advanced opens will still show in the bottom of the canvas panel".
// The strip stays mounted; the advanced view toggles open above it.
// ───────────────────────────────────────────────────────────────────────────

// Two-tab selector for the bottom half of the left rail. Widgets = the
// drag-and-drop palette; Design = themes / backgrounds / music (shared
// pickers reused from the v1 sidebar).
function LeftTabs({
  tab,
  onChange,
}: {
  tab: "widgets" | "design";
  onChange: (next: "widgets" | "design") => void;
}) {
  return (
    <div className="grid grid-cols-2 border-b border-border">
      {(["widgets", "design"] as const).map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={cn(
            "py-2 text-[10px] font-semibold uppercase tracking-wide transition",
            tab === key
              ? "border-b-2 border-brand-purple text-foreground"
              : "border-b-2 border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {key === "widgets" ? "Widgets" : "Design"}
        </button>
      ))}
    </div>
  );
}

function TimelineDock({
  state,
  activeSceneId,
  selection,
  advancedOpen,
  onToggleAdvanced,
  onSelectScene,
  onSelectWidget,
  onSceneDurationChange,
  onWidgetWindowChange,
}: {
  state: CanvasState;
  activeSceneId: string | null;
  selection: Selection;
  advancedOpen: boolean;
  onToggleAdvanced: () => void;
  onSelectScene: (sceneId: string) => void;
  onSelectWidget: (sceneId: string, widgetId: string) => void;
  onSceneDurationChange: (sceneId: string, durationSeconds: number) => void;
  onWidgetWindowChange: (
    widgetId: string,
    visibleFrom: number | null,
    visibleTo: number | null,
  ) => void;
}) {
  const total = totalDurationSeconds(state);
  const selectedWidgetId =
    selection.kind === "widget" ? selection.widgetId : null;
  return (
    <div className="border-t border-border bg-card">
      {advancedOpen && (
        <AdvancedTimeline
          state={state}
          activeSceneId={activeSceneId}
          selectedWidgetId={selectedWidgetId}
          onSelectScene={onSelectScene}
          onSelectWidget={onSelectWidget}
          onSceneDurationChange={onSceneDurationChange}
          onWidgetWindowChange={onWidgetWindowChange}
        />
      )}
      <div className="px-4 py-3">
        <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
          <span>Timeline</span>
          <div className="flex items-center gap-3">
            <span>Total {total.toFixed(1)}s</span>
            <button
              type="button"
              onClick={onToggleAdvanced}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={advancedOpen ? "Hide advanced timeline" : "Show advanced timeline"}
            >
              Advanced
              {advancedOpen ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronUp className="h-3 w-3" />
              )}
            </button>
          </div>
        </div>
        <div className="flex h-10 items-stretch gap-1">
          {state.scenes.map((scene) => {
            const pct = total > 0 ? (scene.durationSeconds / total) * 100 : 0;
            const active = scene.id === activeSceneId;
            return (
              <button
                key={scene.id}
                type="button"
                onClick={() => onSelectScene(scene.id)}
                style={{ flexBasis: `${pct}%` }}
                className={cn(
                  "flex min-w-[3rem] items-center justify-center rounded border text-[10px] font-medium transition",
                  active
                    ? "border-brand-purple bg-brand-purple/10 text-brand-purple"
                    : "border-border bg-background hover:bg-muted",
                )}
              >
                <span className="truncate px-1">{scene.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Initial state hydration — checks localStorage first, then falls back
// to an empty canvas keyed off the template hint.
// ───────────────────────────────────────────────────────────────────────────

function hydrateInitialState(
  projectId: string,
  templateHint: string | null,
): CanvasState {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(LOCAL_STORAGE_PREFIX + projectId);
      if (raw) {
        const parsed = JSON.parse(raw) as { state?: CanvasState };
        if (parsed.state && Array.isArray(parsed.state.scenes) && parsed.state.scenes.length > 0) {
          return parsed.state;
        }
      }
    } catch {
      // Fall through to seed-from-template.
    }
  }
  // Template-seeded layouts ship from a shared catalog — see
  // `lib/studio/editor-v2/template-seeds.ts`. Unknown template ids fall
  // through to an empty canvas without throwing.
  return seedCanvasFromTemplate(templateHint);
}
