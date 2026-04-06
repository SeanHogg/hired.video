// StudioEditor.tsx — tab switcher that adapts per content template.
//
// Resume / Personal Brand  →  Prompt  | Storyboard
// Skills Demo               →  Setup   | Storyboard
// Job Ad / Company Promo    →  Job Details | Storyboard

import { Undo2, Redo2 } from "lucide-react";
import PromptEditor from "@/components/PromptEditor";
import SkillsDemoSetup from "@/components/studio/SkillsDemoSetup";
import StoryboardEditor from "@/components/StoryboardEditor";
import type { StudioProjectState } from "@/types/studio";
import type { VideoScript } from "@/types/video-script";
import type { ContentTemplate } from "./StudioSidebar";

export type EditorTab = "prompt" | "storyboard";

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
}: Props) {
  const firstLabel = getFirstTabLabel(contentTemplate);

  return (
    <div className="studio-editor">
      {/* Tab bar */}
      <div className="flex items-center border-b shrink-0">
        {([
          { id: "prompt" as EditorTab,     label: firstLabel },
          { id: "storyboard" as EditorTab, label: "Storyboard" },
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
          />
        )}

      </div>
    </div>
  );
}
