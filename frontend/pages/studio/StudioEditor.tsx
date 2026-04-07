// StudioEditor.tsx — tab switcher that adapts per content template.
//
// Resume / Personal Brand  →  Prompt  | Storyboard | Actions
// Skills Demo               →  Setup   | Storyboard | Actions
// Job Ad / Company Promo    →  Job Details | Storyboard | Actions

import { Undo2, Redo2 } from "lucide-react";
import PromptEditor from "@/components/PromptEditor";
import SkillsDemoSetup from "@/components/studio/SkillsDemoSetup";
import StoryboardEditor from "@/components/StoryboardEditor";
import StudioActions from "./StudioActions";
import type { StudioProjectState } from "@/types/studio";
import type { VideoScript } from "@/types/video-script";
import type { ContentTemplate } from "./StudioSidebar";

export type EditorTab = "prompt" | "storyboard" | "actions";

interface VoiceoverResult {
  sceneId: string;
  audioUrl: string | null;
  durationMs: number;
  wordTimestamps: Array<{ word: string; start: number; end: number }>;
}

interface Props {
  tab: EditorTab;
  onTabChange: (t: EditorTab) => void;
  state: StudioProjectState;
  onStateChange: (patch: Partial<StudioProjectState>) => void;
  showJD: boolean;
  onToggleJD: () => void;
  onScriptChange: (s: VideoScript) => void;
  focusedSceneId?: string;
  onSceneFocus?: (id: string) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  contentTemplate?: ContentTemplate;
  // Element selection (drives the canvas drag overlay <-> editor link)
  selectedElementId?: string | null;
  onSelectedElementChange?: (id: string | null) => void;
  // Actions tab handlers
  currentTimeSec?: number;
  videoUrl?: string | null;
  onRestoreVersion?: (storyboard: unknown) => void;
  onApplyRewrite?: (scenes: Array<Record<string, unknown>>) => void;
  onApplyHook?: (sceneZeroPatch: { title?: string; subtitle?: string; text?: string }) => void;
  onVoiceoverGenerated?: (results: VoiceoverResult[]) => void;
  onVoiceConfigChange?: (config: {
    engine: "web-speech" | "kokoro" | "piper" | "vibevoice";
    voiceId: string;
    voiceName: string;
    speed: number;
  }) => void;
}

/** First-tab label per content template */
function getFirstTabLabel(ct?: ContentTemplate): string {
  switch (ct) {
    case "skills-demo":    return "Setup";
    case "job_ad":         return "Job Details";
    default:               return "Prompt";
  }
}

export default function StudioEditor({
  tab, onTabChange,
  state, onStateChange, showJD, onToggleJD,
  onScriptChange, focusedSceneId, onSceneFocus,
  canUndo, canRedo, onUndo, onRedo,
  contentTemplate,
  selectedElementId, onSelectedElementChange,
  currentTimeSec, videoUrl,
  onRestoreVersion, onApplyRewrite, onApplyHook, onVoiceoverGenerated,
  onVoiceConfigChange,
}: Props) {
  const firstLabel = getFirstTabLabel(contentTemplate);

  return (
    <div className="studio-editor">
      {/* Tab bar */}
      <div className="flex items-center border-b shrink-0">
        {([
          { id: "prompt" as EditorTab,     label: firstLabel },
          { id: "storyboard" as EditorTab, label: "Storyboard" },
          { id: "actions" as EditorTab,    label: "Actions" },
        ]).map((t) => (
          <button
            key={t.id}
            type="button"
            className={`px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => onTabChange(t.id)}
            disabled={t.id !== "prompt" && !state.script}
          >
            {t.label}
          </button>
        ))}

        {/* Undo / Redo — right-aligned, only shown when script exists */}
        {state.script && (
          <div className="ml-auto flex items-center gap-0.5 pr-3">
            <button
              type="button"
              title="Undo (Ctrl+Z)"
              disabled={!canUndo}
              onClick={onUndo}
              className="p-1.5 rounded hover:bg-accent disabled:opacity-30 transition-colors"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Redo (Ctrl+Shift+Z)"
              disabled={!canRedo}
              onClick={onRedo}
              className="p-1.5 rounded hover:bg-accent disabled:opacity-30 transition-colors"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "prompt" && contentTemplate === "skills-demo" && (
          <SkillsDemoSetup
            state={state}
            onStateChange={onStateChange}
          />
        )}

        {tab === "prompt" && contentTemplate !== "skills-demo" && (
          <PromptEditor
            state={state}
            onStateChange={onStateChange}
            showJD={showJD}
            onToggleJD={onToggleJD}
          />
        )}

        {tab === "storyboard" && state.script && (
          <StoryboardEditor
            script={state.script}
            onScriptChange={onScriptChange}
            focusedSceneId={focusedSceneId}
            onSceneFocus={onSceneFocus}
            selectedElementId={selectedElementId}
            onSelectedElementChange={onSelectedElementChange}
          />
        )}

        {tab === "actions" && (
          <StudioActions
            projectId={state.projectId}
            script={state.script}
            onScriptChange={onScriptChange}
            sceneBoundaries={state.script?.scenes.map((s) => ({
              start: s.start,
              title: typeof s.title === "string" ? s.title : (s.text as string) || "Scene",
            }))}
            videoUrl={videoUrl}
            durationSec={state.script?.video?.duration}
            currentTimeSec={currentTimeSec}
            scenes={state.script?.scenes.map((s) => ({
              id: s.id,
              title: s.title,
              text: typeof s.text === "string" ? s.text : s.text?.join(" "),
              items: s.items,
              skills: s.skills,
            }))}
            scriptText={state.script?.scenes.map((s) =>
              [s.title, s.subtitle, typeof s.text === "string" ? s.text : s.text?.join(" "), s.items?.join(". ")].filter(Boolean).join(". ")
            ).join(" ") ?? ""}
            onRestoreVersion={onRestoreVersion ?? (() => {})}
            onApplyRewrite={onApplyRewrite ?? (() => {})}
            onApplyHook={onApplyHook ?? (() => {})}
            onVoiceoverGenerated={onVoiceoverGenerated}
            onVoiceConfigChange={onVoiceConfigChange}
          />
        )}

      </div>
    </div>
  );
}
