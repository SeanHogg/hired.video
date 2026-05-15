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
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Eye,
  ChevronUp,
  ChevronDown,
  Play,
  Pause,
  SkipBack,
  Music,
  Mic,
} from "lucide-react";
import { resolveMusic } from "@/lib/studio/music-catalog";
import { VISUAL_THEMES, BG_PRESETS } from "@/lib/studio/visual-themes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { studioService, type StudioProject } from "@/lib/services/studio-service";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { cn } from "@/lib/utils";

import {
  type CanvasState,
  type Scene,
  type VoiceoverClip,
  type Widget,
  type WidgetKind,
  type WidgetParams,
  type WidgetPosition,
  applyThemeToState,
  cloneSceneWithNewIds,
  defaultWidget,
  emptyScene,
  totalDurationSeconds,
} from "@/lib/studio/editor-v2/canvas-state";
import {
  canvasStateToTimeline,
  timelineToCanvasState,
} from "@/lib/studio/editor-v2/timeline-emit";
import { scriptToCanvasState } from "@/lib/studio/editor-v2/script-to-canvas";
import {
  parseStudioSubject,
  type StudioSubject,
} from "@shared/studio-subject";
import { canvasStateToScript } from "@/lib/studio/editor-v2/canvas-to-script";
import { seedCanvasFromTemplate } from "@/lib/studio/editor-v2/template-seeds";
import { usePreviewPlayback } from "@/lib/studio/editor-v2/use-preview-playback";
import { useCanvasHistory } from "@/lib/studio/editor-v2/use-canvas-history";
import { useCanvasClipboard } from "@/lib/studio/editor-v2/use-canvas-clipboard";
import { useStudioShortcuts } from "@/lib/studio/editor-v2/use-studio-shortcuts";

import ScenesRail from "@/components/studio/v2/ScenesRail";
import WidgetPalette from "@/components/studio/v2/WidgetPalette";
import CanvasStage, { type Selection } from "@/components/studio/v2/CanvasStage";
import CollapsiblePanel from "@/components/studio/v2/CollapsiblePanel";
import PropertiesPanel from "@/components/studio/v2/PropertiesPanel";
import ZoomControl from "@/components/studio/v2/ZoomControl";
import CanvasEditToolbar from "@/components/studio/v2/CanvasEditToolbar";
import SubjectSeedBanner from "@/components/studio/v2/SubjectSeedBanner";
import AdvancedTimeline from "@/components/studio/v2/AdvancedTimeline";
import ActionsPanel from "@/components/studio/v2/ActionsPanel";
import PreviewOverlay from "@/components/studio/v2/PreviewOverlay";
import StudioSaveButton from "@/components/studio/shared/StudioSaveButton";
import StudioShareMenu from "@/components/studio/shared/StudioShareMenu";
import ProjectChromeMenu from "@/components/studio/shared/ProjectChromeMenu";
import ProjectStatusChips from "@/components/studio/shared/ProjectStatusChips";
import { studioTemplatesService } from "@/lib/services/studio-templates-service";
import type { VideoScript } from "@/types/video-script";

const LinkedInPublisher = lazy(
  () => import("@/components/studio/LinkedInPublisher"),
);

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
  // `?studioTemplate=<slug>` arrives from the marketplace "Use this template"
  // button (use-apply-template emits this for studio-creator kind). The hint
  // is resolved asynchronously below — initial state still hydrates from
  // built-in template seeds; the creator-template fetch then overrides it.
  const studioTemplateSlug = searchParams.get("studioTemplate");
  // `?subject=<kind>:<id>` arrives from every entity-card "Create Video"
  // deep-link (ResumeCard, JobActionsMenu, PeopleCard, CompanyCard,
  // EntityVideos). Parsed once on mount; carried as a pending attachment
  // that ships with the FIRST saveDraft call so the freshly-created
  // project is bound to the source entity. v1 already did this in
  // StudioLayout; this closes the v2-side gap so "Create video from
  // Resume / Job / Company / Profile" actually lands a linked project.
  const urlSubject = useMemo<StudioSubject | null>(
    () => parseStudioSubject(searchParams.get("subject")),
    // We deliberately read this ONCE — subsequent searchParam changes
    // (e.g. internal navigations) shouldn't re-arm the attach.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  // `?capture=screen|webcam|screen+webcam` arrives from the chrome
  // extension side panels + any "Record promo" CTA. Read once on mount
  // so the ActionsPanel auto-opens the matching recorder sheet and the
  // left rail starts on the Actions tab. v1 wired this; v2 was the gap
  // (#651). Mapped here from URL value → ActionsPanel.ActionId.
  const urlCapture = useMemo<"webcam" | "screen" | "screen-pip" | null>(() => {
    const raw = searchParams.get("capture");
    if (raw === "webcam") return "webcam";
    if (raw === "screen") return "screen";
    if (raw === "screen+webcam") return "screen-pip";
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Canvas state lives behind the history wrapper so every mutator
  // call participates in undo/redo. The (state, setState) pair is the
  // same shape useState would give us, so the rest of the editor
  // doesn't need to know history is in play.
  const history = useCanvasHistory<CanvasState>(() =>
    hydrateInitialState(projectId, templateHint),
  );
  const { state, setState, undo, redo, canUndo, canRedo, reset: resetHistory } = history;
  const [title, setTitle] = useState<string>("Untitled video");
  const [persistedProjectId, setPersistedProjectId] = useState<string | null>(
    projectId === "new" ? null : projectId,
  );
  // Full StudioProject envelope — keeps isPublic / subjects / videoUrl
  // around for the shared <ProjectChromeMenu>. Updated on every server
  // round-trip (load, save, clone, visibility toggle).
  const [persistedProject, setPersistedProject] = useState<StudioProject | null>(null);
  const [activeSceneId, setActiveSceneId] = useState<string>(state.scenes[0].id);
  const [selection, setSelection] = useState<Selection>({
    kind: "scene",
    sceneId: state.scenes[0].id,
  });
  const [zoom, setZoom] = useState<number>(0.56);
  const [saving, setSaving] = useState(false);
  const [advancedTimelineOpen, setAdvancedTimelineOpen] = useState(false);
  // `?capture=` deep-links arrive on a fresh editor session expecting
  // the Actions panel armed for recording. Override the default tab +
  // expansion when that's the case so the user lands directly in the
  // recorder sheet (#651).
  const [leftTab, setLeftTab] = useState<"widgets" | "actions">(
    urlCapture ? "actions" : "widgets",
  );
  // Whether the Widgets/Actions section (below the scenes rail) is
  // expanded. When collapsed it shrinks to a thin strip at the bottom
  // of the left panel so the scenes rail can use the full vertical
  // space. Persisted via localStorage so the user's choice survives
  // reload — same pattern as the CollapsiblePanel chrome.
  const [leftBottomOpen, setLeftBottomOpen] = useState<boolean>(() => {
    if (urlCapture) return true;
    if (typeof window === "undefined") return true;
    try {
      const raw = window.localStorage.getItem("studio.v2.left.bottom");
      return raw === "closed" ? false : true;
    } catch {
      return true;
    }
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        "studio.v2.left.bottom",
        leftBottomOpen ? "open" : "closed",
      );
    } catch {
      // ignore quota
    }
  }, [leftBottomOpen]);
  const [previewOpen, setPreviewOpen] = useState(false);
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
        setPersistedProject(project);
        // Two legacy shapes feed this surface: (a) v2 projects with a
        // `timelineSpec` of canvas-v2:* clips, and (b) v1 projects with a
        // `script` (kind='scene' storyboard) and no timelineSpec — or a
        // timelineSpec that isn't v2-authored (the round-trip yields an
        // empty canvas because clipToWidget() bails on non-`canvas-v2:*`
        // effects). For (b) we hydrate from the script so scenes and
        // media land in the editor instead of silently dropping.
        const spec = project.timelineSpec;
        const hydratedFromTimeline = spec ? timelineToCanvasState(spec) : null;
        const timelineHasContent =
          hydratedFromTimeline?.scenes.some((s) => s.widgets.length > 0) ?? false;
        const hydrated = timelineHasContent
          ? hydratedFromTimeline!
          : project.script
            ? scriptToCanvasState(project.script)
            : hydratedFromTimeline;
        if (hydrated) {
          // Reset (not setState) so undo can't take the user below
          // the just-loaded server state — local-session history
          // against a different project's content would be confusing.
          resetHistory(hydrated);
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
  }, [projectId, toast, resetHistory]);

  // Apply `?studioTemplate=<slug>` once on mount when present. The
  // marketplace's "Use this template" button (use-apply-template) emits
  // this URL for studio-creator kind; v1 already handles it via
  // StudioLayout. Mirror behaviour here so v2 users can clone creator
  // templates instead of dead-ending in an empty canvas (#630).
  useEffect(() => {
    if (!studioTemplateSlug || projectId !== "new") return;
    let cancelled = false;
    (async () => {
      try {
        const tpl = await studioTemplatesService.getBySlug(studioTemplateSlug);
        if (cancelled) return;
        const script = tpl.videoScript as VideoScript | null | undefined;
        if (!script) {
          toast({
            title: "Template has no content",
            description: "The creator hasn't finished setting it up yet.",
            variant: "destructive",
          });
          return;
        }
        const hydrated = scriptToCanvasState(script);
        resetHistory(hydrated);
        setActiveSceneId(hydrated.scenes[0].id);
        setSelection({ kind: "scene", sceneId: hydrated.scenes[0].id });
        setTitle(tpl.name);
      } catch (err) {
        toast({
          title: "Couldn't load template",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studioTemplateSlug, projectId, toast, resetHistory]);

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

  const duplicateScene = useCallback(
    (sceneId: string) => {
      // Clone OUTSIDE the setState updater so the new id is stable —
      // React calls updater functions twice under strict mode, which
      // would otherwise mint two different ids and leave the follow-up
      // setActiveSceneId pointing at the wrong one. Mirrors the
      // paste-scene flow in use-canvas-clipboard.ts (DRY).
      const source = state.scenes.find((s) => s.id === sceneId);
      if (!source) return;
      const next = cloneSceneWithNewIds(source);
      next.label = `${source.label} (copy)`;
      setState((prev) => {
        const idx = prev.scenes.findIndex((s) => s.id === sceneId);
        if (idx < 0) return prev;
        const scenes = [...prev.scenes];
        scenes.splice(idx + 1, 0, next);
        return { ...prev, scenes };
      });
      setActiveSceneId(next.id);
      setSelection({ kind: "scene", sceneId: next.id });
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

  // Generic widget patch mutator — used by inspector sections (e.g.
  // Motion, Timing) that mutate Widget-level fields outside of
  // `position` or `params`. Routing through one path keeps undo/redo
  // and autosave on the same wire as the more granular mutators.
  const updateWidget = useCallback(
    (widgetId: string, patch: Partial<Widget>) => {
      setState((prev) => ({
        ...prev,
        scenes: prev.scenes.map((scene) => ({
          ...scene,
          widgets: scene.widgets.map((w) =>
            w.id === widgetId ? { ...w, ...patch } : w,
          ),
        })),
      }));
    },
    [],
  );

  // ───── Mutators surfaced to the Actions panel
  const addMediaWidget = useCallback(
    (
      kind: "image" | "video",
      url: string,
      durationSeconds = 0,
      atFraction?: { x: number; y: number },
    ) => {
      const widget = defaultWidget(kind);
      // Stamp the URL into the widget's content params. defaultWidget
      // gives a URL-backed source by default so we just rewrite the URL.
      if (widget.params.kind === "image") {
        widget.params.data.source = { kind: "url", url };
      } else if (widget.params.kind === "video") {
        widget.params.data.source = { kind: "url", url };
      }
      // When the caller supplied a drop coordinate (drag-drop from
      // MediaPicker or stock results), centre the widget on it. Same
      // anchor math as `insertWidget` so single source of truth for
      // "drop fraction → widget position".
      if (atFraction) {
        widget.position = {
          ...widget.position,
          x: Math.max(
            0,
            Math.min(1 - widget.position.width, atFraction.x - widget.position.width / 2),
          ),
          y: Math.max(
            0,
            Math.min(1 - widget.position.height, atFraction.y - widget.position.height / 2),
          ),
        };
      }
      setState((prev) => {
        const sceneId = activeSceneId;
        return {
          ...prev,
          scenes: prev.scenes.map((s) =>
            s.id === sceneId
              ? {
                  ...s,
                  // Extend the scene duration if the new media exceeds the
                  // scene length, so the user actually sees the clip play.
                  durationSeconds:
                    durationSeconds > s.durationSeconds
                      ? durationSeconds
                      : s.durationSeconds,
                  widgets: [
                    ...s.widgets,
                    {
                      ...widget,
                      position: { ...widget.position, z: s.widgets.length + 1 },
                    },
                  ],
                }
              : s,
          ),
        };
      });
      setSelection({
        kind: "widget",
        sceneId: activeSceneId,
        widgetId: widget.id,
      });
    },
    [activeSceneId],
  );

  const setCaptionsState = useCallback((captions: CanvasState["captions"]) => {
    setState((prev) => ({ ...prev, captions }));
  }, []);

  const addVoiceoverClip = useCallback((clip: VoiceoverClip) => {
    setState((prev) => ({ ...prev, voiceovers: [...prev.voiceovers, clip] }));
  }, []);

  const setMusicFromBlob = useCallback(
    (blob: Blob, durationSeconds: number, label: string) => {
      // Original-music composer hands us a freshly-rendered WAV. We
      // register it as a custom MusicSource so resolveMusic() can hand
      // back a playable URL — same channel the stock picker uses (DRY).
      // R2 upload on save is gap-registered (#563); blob URL is fine
      // for the in-editor preview.
      const url = URL.createObjectURL(blob);
      setState((prev) => ({
        ...prev,
        musicSource: { kind: "custom", url, label, durationSeconds },
      }));
    },
    [],
  );

  const updateWidgetText = useCallback(
    (widgetId: string, nextText: string) => {
      setState((prev) => ({
        ...prev,
        scenes: prev.scenes.map((scene) => ({
          ...scene,
          widgets: scene.widgets.map((w) => {
            if (w.id !== widgetId) return w;
            if (w.params.kind !== "text" && w.params.kind !== "heading") return w;
            return {
              ...w,
              params: {
                kind: w.params.kind,
                data: { ...w.params.data, text: nextText },
              },
            };
          }),
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

  // ───── Clipboard + keyboard shortcuts
  // Cut / copy / paste live in their own hook so the toolbar buttons
  // and the keyboard listener call the SAME action functions (DRY).
  // The clipboard targets whatever the user has selected — widget
  // when a widget is selected, the active scene otherwise — so a
  // single Ctrl+C / Ctrl+V loop covers both.
  const clipboard = useCanvasClipboard({
    state,
    selection,
    activeSceneId,
    setState,
    setActiveSceneId,
    setSelection,
  });
  // Delete handler — uses the SAME mutators that the on-screen Delete
  // buttons fire (DRY) so keyboard + mouse paths can never diverge. We
  // refuse to drop the last remaining scene because the editor invariant
  // is "always one scene to draw on" (deleteScene already enforces this).
  const onDeleteSelection = useCallback(() => {
    if (selection.kind === "widget") {
      deleteWidget(selection.widgetId);
      return;
    }
    if (state.scenes.length > 1) deleteScene(selection.sceneId);
  }, [selection, deleteWidget, deleteScene, state.scenes.length]);
  useStudioShortcuts({
    onUndo: undo,
    onRedo: redo,
    onCopy: clipboard.copy,
    onCut: clipboard.cut,
    onPaste: clipboard.paste,
    onDelete: onDeleteSelection,
  });

  // ───── Export — converts CanvasState → VideoScript → v1's
  // compile + exportVideo pipeline so v2 reuses the SAME render path
  // v1 has shipped + battle-tested (WebCodecs / ffmpeg.wasm /
  // MediaRecorder, watermark, audio mix). Single render seam: every v2
  // export AND every v2 publish goes through `renderToBlob` (DRY) so
  // the YouTube / LinkedIn / Profile flows can't drift from the
  // local-download flow.
  const [exporting, setExporting] = useState(false);
  // In-memory blob of the most recent render — lets a "Publish" click
  // immediately after a successful export skip re-rendering. Cleared
  // whenever the canvas state mutates (the cached blob would be stale).
  const renderedBlobRef = useRef<Blob | null>(null);
  useEffect(() => {
    renderedBlobRef.current = null;
  }, [state]);
  const [linkedInPublishOpen, setLinkedInPublishOpen] = useState(false);

  async function renderToBlob(): Promise<Blob | null> {
    if (state.scenes.length === 0) return null;
    if (renderedBlobRef.current) return renderedBlobRef.current;
    const script = canvasStateToScript(state);
    const { compile } = await import("@/lib/compiler/video-compiler");
    const { exportVideo } = await import("@/lib/renderer/video-exporter");
    const compiled = compile(script);
    const blob = await exportVideo(compiled, {
      audio: script.video.audio,
    });
    renderedBlobRef.current = blob;
    return blob;
  }

  async function handleExport() {
    if (state.scenes.length === 0) return;
    setExporting(true);
    try {
      const blob = await renderToBlob();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.replace(/\s+/g, "-").toLowerCase() || "video"}.webm`;
      a.click();
      // Let the click resolve before revoking — Safari otherwise drops
      // the download.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: "Exported", description: "Your video has been downloaded." });
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  }

  // ───── ensureRendered — V2's parity for v1's `ensureRendered`. Used
  // by every publish destination: kicks off a render + upload when the
  // project doesn't already have a hosted videoUrl, so the user can
  // click "Publish to YouTube" / LinkedIn / Profile on a fresh draft
  // without a separate "Render first" detour. The Save step lands too,
  // so the upload has a project row to attach to. #653.
  async function ensureRendered(): Promise<StudioProject | null> {
    if (state.scenes.length === 0) {
      toast({
        title: "Add a widget first",
        description: "Drop something onto the canvas before publishing.",
        variant: "destructive",
      });
      return null;
    }
    // Persist the draft up front so the upload has a project id to
    // attach to. `handleSave` returns the saved row so we don't have
    // to wait on async setState — the closure's `persistedProject`
    // would otherwise be stale on the first publish click of a new
    // project.
    let projectRow = persistedProject;
    if (!persistedProjectId) {
      projectRow = await handleSave();
      if (!projectRow) return null;
    }
    if (projectRow?.videoUrl) return projectRow;

    setExporting(true);
    try {
      const blob = await renderToBlob();
      if (!blob) return null;
      const uploadRes = await studioService.uploadVideo(
        blob,
        title,
        projectRow?.id ?? persistedProjectId ?? undefined,
      );
      if (!uploadRes.data) throw new Error("Upload failed");
      projectRow = uploadRes.data;
      setPersistedProjectId(projectRow.id);
      setPersistedProject(projectRow);
      if (projectId === "new") {
        navigate(`/studio/${encodeURIComponent(projectRow.id)}`, { replace: true });
      }
      return projectRow;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({
        title: "Render failed",
        description: /QUOTA_EXCEEDED/i.test(msg)
          ? "Free accounts can publish 1 video. Upgrade for unlimited."
          : msg,
        variant: "destructive",
      });
      return null;
    } finally {
      setExporting(false);
    }
  }

  async function handlePublishToYouTube() {
    const project = await ensureRendered();
    if (!project) return;
    try {
      const res = await studioService.publishVideo(project.id, {
        title,
        description: "",
        privacyStatus: project.isPublic ? "public" : "unlisted",
      });
      if (!res.data) throw new Error("Publish failed");
      setPersistedProject(res.data);
      toast({ title: "Published to YouTube!", description: "Your video is live." });
    } catch (err) {
      toast({
        title: "Publish failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  async function handlePublishToProfile() {
    const isOnProfile = persistedProject?.status === "Published";
    // Going off-profile doesn't need a fresh render — it's a status
    // flip. Going on-profile does (V2 may be unrendered). Read the
    // canonical id from `ensureRendered`'s return so the status PATCH
    // can't fire against a stale closure-captured id.
    let targetId = persistedProjectId;
    if (!isOnProfile) {
      const project = await ensureRendered();
      if (!project) return;
      targetId = project.id;
    }
    if (!targetId) return;
    const nextStatus = isOnProfile ? "exported" : "published";
    try {
      const res = await studioService.updateProjectStatus(
        targetId,
        nextStatus,
      );
      if (res.data) {
        setPersistedProject(res.data);
        toast({
          title: isOnProfile ? "Removed from profile" : "Published to profile!",
          description: isOnProfile
            ? "The video stays in your library — share it whenever you want."
            : "Your video is now visible on your profile.",
        });
      }
    } catch (err) {
      toast({
        title: isOnProfile ? "Remove failed" : "Publish failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  async function handlePublishToLinkedIn() {
    const project = await ensureRendered();
    if (!project) return;
    setLinkedInPublishOpen(true);
  }

  // ───── Save / publish
  // Returns the persisted StudioProject so callers (notably
  // `ensureRendered`) can chain a follow-up upload without re-reading
  // through the async-state setters. Resolves to null on failure.
  async function handleSave(): Promise<StudioProject | null> {
    setSaving(true);
    try {
      const timeline = canvasStateToTimeline(state);
      // #637 closed: V2 no longer mirrors a v1 VideoScript projection
      // onto the project row. Publish-as-template now accepts an
      // inline script from the dialog (computed via
      // `canvasStateToScript(state)` at click time), so the project
      // stores exactly one canonical representation: the timelineSpec.
      const res = await studioService.saveDraft({
        name: title,
        projectId: persistedProjectId ?? undefined,
        kind: "nle",
        timelineSpec: timeline,
        // First save of a `/studio/new?subject=...` deep-link binds the
        // freshly-created project row to the source entity. Subsequent
        // saves (persistedProjectId set) leave the subjects array alone
        // — the chips in the header are the canonical edit surface.
        ...(persistedProjectId === null && urlSubject
          ? { subjects: [urlSubject] }
          : {}),
      });
      if (res.data?.id) {
        setPersistedProjectId(res.data.id);
        setPersistedProject(res.data);
        if (projectId === "new") {
          navigate(`/studio/${encodeURIComponent(res.data.id)}`, { replace: true });
        }
      }
      toast({ title: "Saved" });
      return res.data ?? null;
    } catch (err) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
      return null;
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
          // min-h-0 lets descendants (left/right panels + canvas) constrain
          // to the viewport so their overflow:auto scrolls internally
          // instead of growing the page and scrolling the document.
          "flex min-h-0 flex-1 flex-col pt-16 transition-all duration-300",
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
          persistedProjectId={persistedProjectId}
          persistedProject={persistedProject}
          onProjectChange={setPersistedProject}
          getVideoScript={() => canvasStateToScript(state)}
          hasContent={state.scenes.some((s) => s.widgets.length > 0)}
          onOpenPreview={() => setPreviewOpen(true)}
          onExport={handleExport}
          exporting={exporting}
          onPublishToYouTube={handlePublishToYouTube}
          onPublishToLinkedIn={handlePublishToLinkedIn}
          onPublishToProfile={handlePublishToProfile}
        />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* LEFT — scenes (top) + tabbed Add / Design panel (bottom). The
              bottom panel hosts the widget palette and the shared theme /
              background / music pickers behind tabs so the v2 user has
              parity with v1's sidebar sections. Collapsible via the shared
              CollapsiblePanel (own state, persists to localStorage). */}
          <CollapsiblePanel
            side="left"
            label="Scenes"
            storageKey="studio.v2.panel.left"
            expandedClassName="w-64"
          >
            {/* Scenes rail grows to fill remaining space; widgets/actions
                section collapses to a thin strip at the bottom on demand
                so the user can give scenes the full vertical column. */}
            <div className="min-h-0 flex-1 border-b border-border">
              <ScenesRail
                scenes={state.scenes}
                activeSceneId={activeSceneId}
                onSelect={(id) => {
                  setActiveSceneId(id);
                  setSelection({ kind: "scene", sceneId: id });
                }}
                onAdd={addScene}
                onDelete={deleteScene}
                onDuplicate={duplicateScene}
                onReorder={reorderScenes}
              />
            </div>
            <div
              className={cn(
                "flex flex-col bg-card",
                leftBottomOpen ? "h-[55%] min-h-[200px]" : "shrink-0",
              )}
            >
              <LeftTabs
                tab={leftTab}
                onChange={setLeftTab}
                expanded={leftBottomOpen}
                onToggle={() => setLeftBottomOpen((open) => !open)}
              />
              {leftBottomOpen && (
                <div className="min-h-0 flex-1 overflow-hidden">
                  {leftTab === "widgets" && (
                    <WidgetPalette onInsert={(kind) => insertWidget(kind)} />
                  )}
                  {leftTab === "actions" && (
                    <ActionsPanel
                      defaultOpenAction={urlCapture ?? undefined}
                      state={state}
                      activeScene={activeScene}
                      selectedWidget={
                        selection.kind === "widget"
                          ? activeScene.widgets.find(
                              (w) => w.id === selection.widgetId,
                            ) ?? null
                          : null
                      }
                      persistedProjectId={persistedProjectId}
                      videoId={persistedProject?.youtubeVideoId ?? persistedProject?.id ?? null}
                      onAddVideoWidget={(url, durationSeconds) =>
                        addMediaWidget("video", url, durationSeconds)
                      }
                      onAddImageWidget={(url) => addMediaWidget("image", url)}
                      onAddVoiceover={addVoiceoverClip}
                      onSetCaptions={setCaptionsState}
                      onSetMusicFromBlob={setMusicFromBlob}
                      onUpdateWidgetText={updateWidgetText}
                      onRestoreCanvas={(next) => {
                        // Reset the history so undo can't take the user
                        // below the restored version (matches the
                        // load-from-server bootstrap pattern).
                        resetHistory(next);
                        setActiveSceneId(next.scenes[0]?.id ?? activeSceneId);
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          </CollapsiblePanel>

          {/* CENTER — canvas + timeline. `min-w-0` is critical: without it
              flex children default to `min-width: auto`, which lets the
              canvas push the side panels out of the viewport when the user
              zooms past fit. With `min-w-0` the column stays bounded and
              the inner overflow-auto wrapper scrolls instead. */}
          <section className="flex min-w-0 flex-1 flex-col bg-muted/30">
            {/* Subject deep-link banner — shown when the user arrived via
                `?subject=` AND the canvas is still empty (#650). Offers
                an AI pre-fill from the linked entity. Self-hides as soon
                as widgets land or the user dismisses. */}
            <SubjectSeedBanner
              subject={urlSubject}
              canvasEmpty={state.scenes.every((s) => s.widgets.length === 0)}
              onSeed={(script) => {
                const hydrated = scriptToCanvasState(script);
                resetHistory(hydrated);
                setActiveSceneId(hydrated.scenes[0].id);
                setSelection({ kind: "scene", sceneId: hydrated.scenes[0].id });
              }}
            />
            {/* Canvas viewport — fixed-bounded relative wrapper. The
                scrollable stage is `absolute inset-0` so its size is
                fully determined by this wrapper (not by its contents),
                which means zooming can never push the outer chrome
                (timeline, header, side panels) out of the viewport.
                ZoomControl is a sibling, not a child, of the scroll
                container so it stays pinned to viewport edges instead of
                drifting off-left when the user scrolls a zoomed-in
                canvas horizontally. */}
            <div className="relative min-h-0 flex-1">
              <div
                ref={stageContainerRef}
                className="absolute inset-0 overflow-auto bg-muted/30 p-6"
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
                    onThemeDrop={(themeId) => {
                      const theme = VISUAL_THEMES.find((t) => t.id === themeId);
                      if (!theme) return;
                      setState((prev) => applyThemeToState(prev, theme));
                      toast({ title: `Theme: ${theme.label}` });
                    }}
                    onBackgroundDrop={(bgValue) => {
                      const preset = BG_PRESETS.find((p) => p.value === bgValue);
                      if (!preset) return;
                      updateScene(activeScene.id, {
                        backgroundColor: preset.solidColor,
                      });
                      toast({ title: `Background: ${preset.label}` });
                    }}
                    onMediaDrop={(url, mediaType, atFraction) => {
                      if (mediaType === "video") {
                        addMediaWidget("video", url, 0, atFraction);
                      } else {
                        addMediaWidget("image", url, 0, atFraction);
                      }
                    }}
                    playheadInScene={
                      playback.isPlaying &&
                      playback.activeSceneIdAtPlayhead === activeScene.id
                        ? playback.activeSceneElapsed
                        : null
                    }
                    defaultFontId={state.fontFamily}
                  />
                </div>
              </div>
              {/* Floating canvas-stage chrome — edit toolbar (left) +
                  zoom (right). Lives next to the canvas rather than in
                  the header so edit ops sit beside the surface they
                  act on (#647). */}
              <div className="pointer-events-none absolute left-3 bottom-3 z-10">
                <CanvasEditToolbar
                  history={{ undo, redo, canUndo, canRedo }}
                  clipboard={clipboard}
                />
              </div>
              <div className="pointer-events-none absolute right-3 bottom-3 z-10">
                <ZoomControl zoom={zoom} onChange={setZoom} onFit={fitZoom} />
              </div>
            </div>
            <CollapsiblePanel
              side="bottom"
              label="Timeline"
              storageKey="studio.v2.panel.timeline"
            >
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
            </CollapsiblePanel>
          </section>

          {/* RIGHT — properties panel. Also hosts the previously-DESIGN-tab
              configuration (themes / fonts / palette / motion / music /
              format / export) under a "Canvas" section group, surfaced
              when no widget is selected. Selecting a widget swaps the
              panel to that widget's meta. */}
          <CollapsiblePanel
            side="right"
            label="Properties"
            storageKey="studio.v2.panel.right"
            expandedClassName="w-72"
          >
            <PropertiesPanel
              state={state}
              selection={selection}
              onUpdateScene={updateScene}
              onDeleteScene={deleteScene}
              onDuplicateScene={duplicateScene}
              onUpdateWidgetPosition={updateWidgetPosition}
              onUpdateWidgetParams={updateWidgetParams}
              onUpdateWidget={updateWidget}
              onDeleteWidget={deleteWidget}
              onSelectTheme={(theme) =>
                setState((prev) => applyThemeToState(prev, theme))
              }
              onSelectBackground={(preset) =>
                updateScene(activeScene.id, {
                  backgroundColor: preset.solidColor,
                })
              }
              onSelectMusic={(track) => {
                if (track.id === "none") {
                  setState((prev) => ({ ...prev, musicSource: null }));
                  toast({ title: "Music removed" });
                  return;
                }
                setState((prev) => ({
                  ...prev,
                  musicSource: { kind: "stock", trackId: track.id },
                }));
                toast({ title: `Music: ${track.label}` });
              }}
              onSelectFormat={(format) => {
                // Widgets are stored as fractional (0..1) positions so
                // they survive resolution changes without re-mapping.
                setState((prev) => ({
                  ...prev,
                  width: format.width,
                  height: format.height,
                }));
                toast({
                  title: `Format: ${format.label}`,
                  description: `${format.width} × ${format.height}`,
                });
              }}
              onSelectCodec={(preset) => {
                setState((prev) => ({ ...prev, codec: preset.id }));
                toast({ title: `Export codec: ${preset.label}` });
              }}
              onSelectMotion={(preset) =>
                setState((prev) => ({ ...prev, motion: preset.id }))
              }
              onSelectTransition={(preset) =>
                setState((prev) => ({
                  ...prev,
                  defaultTransition: preset.id,
                }))
              }
              onSelectFont={(preset) =>
                setState((prev) => ({ ...prev, fontFamily: preset.id }))
              }
              onChangePalette={(palette) =>
                setState((prev) => ({ ...prev, colorPalette: palette }))
              }
            />
          </CollapsiblePanel>
        </div>
      </div>
      {previewOpen && (
        <PreviewOverlay
          state={state}
          playback={playback}
          onClose={() => setPreviewOpen(false)}
        />
      )}
      {/* LinkedIn publisher modal — opened by `onPublishToLinkedIn`
          AFTER ensureRendered has uploaded the video. Mirrors v1's
          StudioLayout LinkedIn modal so the publish UX is identical
          across editors (#653). */}
      {linkedInPublishOpen && persistedProjectId && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-card border rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-semibold">Publish to LinkedIn</h2>
              <button
                type="button"
                onClick={() => setLinkedInPublishOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <span className="sr-only">Close</span>
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="p-5">
              <Suspense
                fallback={
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    Loading…
                  </div>
                }
              >
                <LinkedInPublisher
                  projectId={persistedProjectId}
                  videoBlob={renderedBlobRef.current}
                  defaultText={state.scenes
                    .map((s) => s.label)
                    .filter(Boolean)
                    .join(". ")
                    .slice(0, 200)}
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
  persistedProjectId,
  persistedProject,
  onProjectChange,
  getVideoScript,
  hasContent,
  onOpenPreview,
  onExport,
  exporting,
  onPublishToYouTube,
  onPublishToLinkedIn,
  onPublishToProfile,
}: {
  title: string;
  onTitleChange: (next: string) => void;
  onBack: () => void;
  onSave: () => void;
  saving: boolean;
  playback: ReturnType<typeof usePreviewPlayback>;
  persistedProjectId: string | null;
  persistedProject: StudioProject | null;
  onProjectChange: (next: StudioProject) => void;
  getVideoScript: () => unknown;
  hasContent: boolean;
  onOpenPreview: () => void;
  onExport: () => void;
  exporting: boolean;
  onPublishToYouTube: () => void;
  onPublishToLinkedIn: () => void;
  onPublishToProfile: () => void;
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
        {/* Project STATUS chips (visibility + linked subjects) live with
            the title. They describe the project; they're NOT actions.
            Self-gates: renders nothing for an unsaved draft. */}
        <ProjectStatusChips project={persistedProject} onChange={onProjectChange} />
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
        {/* "+ New Video" + Wizard live on the Studio landing (`/studio`,
            reachable via the ← Back arrow). Putting them on the per-
            project header conflated "make ANOTHER project" with "do
            something to THIS project". */}
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1"
          onClick={onOpenPreview}
        >
          <Eye className="h-4 w-4" />
          Preview
        </Button>
        {/* Single split-button: Export (primary, downloads MP4) +
            chevron-dropdown with Share (copy link) and Publish
            (YouTube / LinkedIn / Profile). Replaces the separate
            "Export" + "Share" buttons so the user sees one cluster
            instead of two adjacent controls (#653). */}
        <StudioShareMenu
          projectId={persistedProjectId}
          hasVideo={!!persistedProject?.videoUrl}
          isPublishedToProfile={persistedProject?.status === "Published"}
          onExport={onExport}
          exporting={exporting}
          canExport={hasContent}
          onPublishToYouTube={onPublishToYouTube}
          onPublishToLinkedIn={onPublishToLinkedIn}
          onPublishToProfile={onPublishToProfile}
        />
        {/* Single overflow `…` for project + template actions (clone,
            delete, publish-as-template, my-published-templates).
            Self-gates: returns null when no project has been persisted
            yet. `getVideoScript` lets the publish flow project canvas
            state into a v1 VideoScript only at publish-time (#637). */}
        <ProjectChromeMenu
          project={persistedProject}
          getVideoScript={getVideoScript}
        />
        <StudioSaveButton
          saving={saving}
          onSave={onSave}
          hasContent={hasContent}
          variant="compact"
        />
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

// Tab selector for the bottom half of the left rail. Widgets = the
// drag-and-drop palette; Actions = recording / AI tools / captions /
// engagement (v1 dialogs mounted via ActionsPanel adapters). Project-
// wide configuration (themes / fonts / palette / motion / music /
// format / export) now lives in the right inspector under the "Canvas"
// section group — selecting nothing on the canvas surfaces it there.
const LEFT_TABS = [
  { id: "widgets", label: "Widgets" },
  { id: "actions", label: "Actions" },
] as const;
type LeftTabId = (typeof LEFT_TABS)[number]["id"];

function LeftTabs({
  tab,
  onChange,
  expanded,
  onToggle,
}: {
  tab: LeftTabId;
  onChange: (next: LeftTabId) => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-stretch border-y border-border">
      {LEFT_TABS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => {
            // Re-clicking a tab when the section is collapsed re-opens it;
            // otherwise it's a plain tab switch.
            if (!expanded) onToggle();
            onChange(id);
          }}
          className={cn(
            "flex-1 py-2 text-[10px] font-semibold uppercase tracking-wide transition",
            tab === id && expanded
              ? "border-b-2 border-brand-purple text-foreground"
              : "border-b-2 border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
      <button
        type="button"
        onClick={onToggle}
        aria-label={expanded ? "Collapse widgets/actions" : "Expand widgets/actions"}
        className="flex h-9 w-9 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronUp className="h-4 w-4" />
        )}
      </button>
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
  // Outer border + bg come from the wrapping CollapsiblePanel; this
  // root is a plain block. The collapse toggle half-protrudes above
  // the top-left edge of the panel, so the header row needs no padding
  // adjustment — the toggle never overlaps content.
  return (
    <div>
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
        <AudioTimelineRow state={state} />
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// AudioTimelineRow — single read-only row under the scene strip showing
// the active music track + voiceover clips so the user can see at a
// glance that their pick landed on the composition. Editing audio
// timing happens in the Advanced timeline (gap-registered for full
// per-clip editing). Self-gates: returns null when there's no audio.
// ───────────────────────────────────────────────────────────────────────────

function AudioTimelineRow({ state }: { state: CanvasState }) {
  const music = resolveMusic(state.musicSource);
  if (!music && state.voiceovers.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-col gap-1">
      {music && (
        <div className="flex h-7 items-center gap-2 rounded border border-emerald-500/40 bg-emerald-500/10 px-2 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
          <Music className="h-3 w-3" />
          <span className="truncate">Music · {music.label}</span>
        </div>
      )}
      {state.voiceovers.map((vo) => (
        <div
          key={vo.id}
          className="flex h-7 items-center gap-2 rounded border border-sky-500/40 bg-sky-500/10 px-2 text-[10px] font-medium text-sky-700 dark:text-sky-300"
        >
          <Mic className="h-3 w-3" />
          <span className="truncate">
            Voiceover · {vo.label} ({vo.durationSeconds.toFixed(1)}s)
          </span>
        </div>
      ))}
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
