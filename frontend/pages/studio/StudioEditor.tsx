// StudioEditor.tsx — tab switcher that adapts per content template.
//
// First tab label and intake form are read from the template catalog so this
// file never has to branch per template.

import { Check, Undo2, Redo2 } from "lucide-react";
import StoryboardEditor from "@/components/StoryboardEditor";
import StudioActions from "./StudioActions";
import NleActionsPanel from "@/components/studio/nle/NleActionsPanel";
import type { StudioProjectState } from "@/types/studio";
import type { VideoScript } from "@/types/video-script";
import type { Timeline } from "@shared/timeline";
import { getTemplate, type ContentTemplate } from "@/components/studio/templates/catalog";
import { canGenerateScript } from "@/lib/studio/can-generate";
import { cn } from "@/lib/utils";

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
  onSceneFocus?: (id: string | null) => void;
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
  /** Pass-through to PromptEditor — flashes the required-field state when
   *  the user clicked Save without enough resume content. */
  promptValidationFlash?: boolean;
  /** Pass-through to PromptEditor — auto-link the source artifact (resume
   *  / job) the user picks as a subject on the active project. */
  onLinkSubject?: (subject: { kind: "resume" | "job"; id: string }) => void;
  /** Project kind. NLE projects swap the Actions tab content for the
   *  effects + export profile panel. NleActionsPanel SELF-GATES on
   *  this; the StudioEditor never branches on `kind` inline. */
  projectKind: "scene" | "nle";
  nleTimeline: Timeline | null;
  onNleTimelineChange: (next: Timeline) => void;
  selectedClipId: string | null;
  onSelectClip: (id: string | null) => void;
}

export default function StudioEditor({
  tab, onTabChange,
  state, onStateChange, showJD: _showJD, onToggleJD: _onToggleJD,
  onScriptChange, focusedSceneId, onSceneFocus,
  canUndo, canRedo, onUndo, onRedo,
  contentTemplate,
  selectedElementId, onSelectedElementChange,
  currentTimeSec, videoUrl,
  onRestoreVersion, onApplyRewrite, onApplyHook, onVoiceoverGenerated,
  onVoiceConfigChange,
  promptValidationFlash,
  onLinkSubject,
  projectKind,
  nleTimeline,
  onNleTimelineChange,
  selectedClipId,
}: Props) {
  const activeTemplate = getTemplate(contentTemplate);
  const firstLabel = activeTemplate.firstTabLabel;
  const Intake = activeTemplate.IntakeForm;
  const promptDone = canGenerateScript(state);
  const hasScript = state.script != null;
  const hasVideo = state.videoBlob != null || state.videoUrl != null;

  // Tab metadata table — single source for label, "is done" predicate, and
  // "is gated by an upstream step" predicate. Render order is the natural
  // 1 → 2 → 3 progression we want users to follow.
  const tabsMeta: Array<{
    id: EditorTab;
    label: string;
    done: boolean;
    /** Disabled until the prior step is done. */
    locked: boolean;
  }> = [
    { id: "prompt",     label: firstLabel,    done: promptDone,  locked: false },
    { id: "storyboard", label: "Storyboard",  done: hasScript,   locked: !promptDone },
    { id: "actions",    label: "Actions",     done: hasVideo,    locked: !hasScript },
  ];

  return (
    <div className="studio-editor">
      {/* Tab bar — numbered pills walk the user through the flow. */}
      <div className="flex items-center border-b shrink-0">
        {tabsMeta.map((t, i) => {
          const isActive = tab === t.id;
          // Pill state: done > active > pending. Done shows a check; active
          // and pending show the step number with different colours.
          const pillBase =
            "shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-semibold mr-2 transition-colors";
          const pillClass = t.done
            ? "bg-emerald-500 text-white"
            : isActive
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground";
          return (
            <button
              key={t.id}
              type="button"
              className={cn(
                "px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center",
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
                t.locked && "opacity-50 cursor-not-allowed",
              )}
              onClick={() => onTabChange(t.id)}
              disabled={t.locked}
              title={t.locked ? "Complete the previous step first" : undefined}
            >
              <span className={pillBase + " " + pillClass}>
                {t.done ? <Check className="w-3 h-3" /> : i + 1}
              </span>
              {t.label}
            </button>
          );
        })}

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
        {tab === "prompt" && (
          <Intake
            state={state}
            onStateChange={onStateChange}
            validationFlash={promptValidationFlash}
            onLinkSubject={onLinkSubject}
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
          <>
            {/* NLE projects swap StudioActions out for the effects + export
                profile panel. NleActionsPanel self-gates on `kind`, so the
                StudioActions block below also self-gates by checking it. The
                two never render simultaneously, but neither one is wrapped
                in a parent-side `if` — both decide their own visibility per
                the standing DRY rule. */}
            <NleActionsPanel
              kind={projectKind}
              timeline={nleTimeline}
              onTimelineChange={onNleTimelineChange}
              selectedClipId={selectedClipId}
            />
            {projectKind === "scene" && (
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
          </>
        )}

      </div>
    </div>
  );
}
