/**
 * The contract between StudioEditorV2 (the orchestrator) and each studio
 * format's surface module (components/studio/v2/surfaces/<format>/): the
 * typed context a format reads, and the slots a format can fill — its left
 * tabs, AI generator, host rail tools, inspector, header Preview + history
 * and the timeline strip. The registry (./registry.tsx) binds each runtime
 * to its surface with a context carrying ONLY the runtime(s) that surface
 * reads, so the orchestrator composes data instead of branching.
 */
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { TFunction } from "i18next";
import type { NavigateFunction } from "react-router-dom";
import type { MediaKind } from "@shared/media-kinds";
import type { StudioProject } from "@/lib/services/studio-service";
import type { Selection } from "@/lib/studio/editor-v2/editor-types";
import type { CanvasSectionCallbacks } from "@/lib/studio/editor-v2/use-canvas-section-callbacks";
import type { HeaderPreview } from "@/components/workspace/WorkspaceHeader";
import type { HistoryControls } from "@/lib/workspace/use-undo-shortcuts";
import type { WorkspaceDepthControls } from "@/lib/workspace/use-workspace-depth";
import type { FocusLeftPanelState, FocusLeftTab } from "@/lib/studio/use-focus-left-panel";
import type { useToast } from "@/hooks/use-toast";
import type { CanvasState } from "@/lib/studio/editor-v2/canvas-state";
import type { PreviewPlayback } from "@/lib/studio/editor-v2/use-preview-playback";
import type { useAudioLayers } from "@/lib/studio/editor-v2/use-audio-layers";
import type { ImageRuntime } from "@/lib/studio/editor-v2/use-image-runtime";
import type {
  AnimationRuntime,
  Cad3DRuntime,
  CadRuntime,
  DocumentRuntime,
  GameRuntime,
  InteractiveComicRuntime,
  StudioRuntimes,
} from "@/lib/studio/editor-v2/use-history-runtimes";
import type { StudioDialogs } from "@/lib/studio/editor-v2/use-studio-dialogs";
import type { WidgetActions } from "@/lib/studio/editor-v2/use-widget-actions";
import type { EditorCommands, SceneMutators } from "@/lib/studio/editor-v2/use-editor-commands";
import type { HostRailTools } from "@/lib/studio/editor-v2/use-studio-rail";
import type { TimelineCanvas } from "@/lib/studio/editor-v2/use-timeline-canvas";
import type { SectionDrill } from "@/components/workspace/inspector/use-section-drill";
import type { SlotPanel } from "@/components/workspace/RightSlot";

/** The Timeline runtime (CanvasState scenes + widgets) a time-based format
 *  authors on. */
export interface TimelineFormatCtx {
  state: CanvasState;
  setState: Dispatch<SetStateAction<CanvasState>>;
  /** Make a scene the active one and select it. */
  selectScene: TimelineCanvas["selectScene"];
  /** Replace the canvas and clear undo (a restore / seed). */
  loadCanvas: TimelineCanvas["loadCanvas"];
  history: HistoryControls;
  activeSceneId: string;
  setActiveSceneId: Dispatch<SetStateAction<string>>;
  selection: Selection;
  setSelection: Dispatch<SetStateAction<Selection>>;
  playback: PreviewPlayback;
  mutators: SceneMutators;
  audio: ReturnType<typeof useAudioLayers>;
  widgetActions: WidgetActions;
  commands: EditorCommands;
  canvasSectionCallbacks: CanvasSectionCallbacks;
  persistedProject: StudioProject | null;
  persistedProjectId: string | null;
  /** The inspector section open in place (‹ back in the slot header). */
  inspectorDrill: SectionDrill;
}

/** What every format's surface reads — no runtime state. */
export interface StudioFormatCtx {
  t: TFunction;
  toast: ReturnType<typeof useToast>["toast"];
  navigate: NavigateFunction;
  mediaKind: MediaKind;
  /** The route id — "new" for an unsaved draft. */
  routeProjectId: string;
  zoom: number;
  depth: WorkspaceDepthControls;
  leftPanel: FocusLeftPanelState;
  /** The floating AI selection chip (self-gated; null when hidden). */
  aiChipNode: ReactNode;
  dialogs: StudioDialogs;
  /** The Timeline history — the header's undo/redo for a format without
   *  its own history. */
  canvasHistory: HistoryControls;
  /** Drop media onto the active Timeline scene (the default AI generator). */
  addMediaWidget: WidgetActions["addMediaWidget"];
}

/** A time-based format (and Comic+'s pages): the Timeline runtime. */
export type TimelineSurfaceCtx = StudioFormatCtx & { timeline: TimelineFormatCtx };
/** The drawing runtime (image; animation borrows its tools). */
export type ImageSurfaceCtx = StudioFormatCtx & { image: ImageRuntime };
export type AnimationSurfaceCtx = ImageSurfaceCtx & { animation: AnimationRuntime };
export type GameSurfaceCtx = StudioFormatCtx & {
  game: GameRuntime;
  /** Game Playtest toggle (header Preview ↔ `<GameStage mode>`). */
  gamePlaying: boolean;
  setGamePlaying: Dispatch<SetStateAction<boolean>>;
};
export type DocumentSurfaceCtx = StudioFormatCtx & { document: DocumentRuntime };
export type CadSurfaceCtx = StudioFormatCtx & { cad: CadRuntime };
export type Cad3DSurfaceCtx = StudioFormatCtx & { cad3d: Cad3DRuntime };
export type InteractiveComicSurfaceCtx = StudioFormatCtx & { interactiveComic: InteractiveComicRuntime };

/** A format's inspector for the right slot: its title and body, plus — when
 *  a section is open in place — the slot header's kicker and ‹ back. */
export type StudioInspector = Pick<SlotPanel, "title" | "content" | "kicker" | "onBack">;

/** What the registry binds each surface's context from. The Timeline ctx is
 *  a builder so it is only assembled for the Timeline family. */
export interface StudioFormatSources {
  runtimes: StudioRuntimes;
  timeline: () => TimelineFormatCtx;
  gamePlaying: boolean;
  setGamePlaying: Dispatch<SetStateAction<boolean>>;
}

/** What a tool family contributes to the workspace frame. Omitted slots
 *  fall back to the orchestrator's defaults (no host tools / inspector /
 *  Preview / strip; the Timeline history). */
export interface StudioFormatSurface<C extends StudioFormatCtx = StudioFormatCtx> {
  /** The format's left-panel tabs after the shared AI tab. */
  leftTabs: (ctx: C) => FocusLeftTab[];
  /** The AI tab's generator (undefined → chat only). */
  aiGenerator: (ctx: C) => ReactNode | undefined;
  hostTools?: (ctx: C) => HostRailTools;
  /** Called only when the format-runtime descriptor says the format has an
   *  inspector right now (`hasInspector`) — a surface never re-decides it. */
  inspector?: (ctx: C) => StudioInspector | null;
  preview?: (ctx: C) => HeaderPreview | null;
  history?: (ctx: C) => HistoryControls;
  strip?: (ctx: C) => ReactNode;
}
