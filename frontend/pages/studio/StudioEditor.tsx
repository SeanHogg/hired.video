// StudioEditor.tsx — tab switcher: Prompt | Storyboard.
// Auto-switches to Storyboard after generation.

import PromptEditor from "@/components/PromptEditor";
import StoryboardEditor from "@/components/StoryboardEditor";
import type { StudioProjectState } from "@/types/studio";
import type { VideoScript } from "@/types/video-script";

export type EditorTab = "prompt" | "storyboard";

const TABS: { id: EditorTab; label: string }[] = [
  { id: "prompt",     label: "Prompt"     },
  { id: "storyboard", label: "Storyboard" },
];

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
}

export default function StudioEditor({
  tab, onTabChange,
  state, onStateChange, showJD, onToggleJD,
  onScriptChange, focusedSceneId, onSceneFocus,
}: Props) {
  return (
    <div className="studio-editor">
      {/* Tab bar */}
      <div className="flex border-b shrink-0">
        {TABS.map((t) => (
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
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "prompt" && (
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
