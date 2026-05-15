/**
 * WizardLauncher — Wand2 button that opens the existing 3-step
 * StudioWizard modal and translates its completion (a generated
 * VideoScript) into a freshly-created Studio project that the editor
 * then opens. Replaces the in-page state-reset flow v1's StudioLayout
 * used; every "open wizard → create video" path now routes through
 * here (DRY).
 *
 * The launcher manages all state the wizard needs locally:
 *   - StudioProjectState slice (resume text, prompt, target duration,
 *     resolution, motion, purpose, theme template) — defaults from
 *     `defaultStudioState` so the wizard never sees `undefined`.
 *   - Open / closed.
 *   - Generation status (proxied to the wizard's running flag).
 *
 * On wizard completion (template-load OR AI-generate), the wizard
 * yields a `VideoScript`. The launcher:
 *   1. Decides the project `kind` ("nle" | "scene") from the user's
 *      editor preference — consumer doesn't pass a `kind` boolean.
 *   2. Converts the script to a `timelineSpec` (v2) by way of
 *      `scriptToCanvasState → canvasStateToTimeline`. v1 projects skip
 *      this and store the raw script.
 *   3. Calls `studioService.saveDraft` and navigates to the resulting
 *      `/studio/:id`.
 *
 * Self-gating: visible to any authenticated Studio user. No `canX`
 * boolean prop drilling.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import StudioWizard from "@/pages/studio/StudioWizard";
import {
  defaultStudioState,
  type StudioProjectState,
} from "@/types/studio";
import type { VideoScript } from "@/types/video-script";
import {
  type ContentTemplate,
} from "@/components/studio/templates/catalog";
import { studioService } from "@/lib/services/studio-service";
import { useEditorPreference } from "@/lib/studio/editor-v2/preferences";
import { scriptToCanvasState } from "@/lib/studio/editor-v2/script-to-canvas";
import { canvasStateToTimeline } from "@/lib/studio/editor-v2/timeline-emit";
import { cn } from "@/lib/utils";

export interface WizardLauncherProps {
  /** Visual variant for the trigger — "icon" (Wand2 only) or "button"
   *  (icon + "Wizard" label). Defaults to "icon" for editor-toolbar
   *  use; "button" for landing CTAs. */
  variant?: "icon" | "button";
  className?: string;
}

export default function WizardLauncher({
  variant = "icon",
  className,
}: WizardLauncherProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isV2 } = useEditorPreference();
  const [open, setOpen] = useState(false);
  // The wizard mutates a StudioProjectState slice as the user fills it
  // out — held locally so the launcher is self-contained and the host
  // page doesn't have to thread the shape through.
  const [state, setState] = useState<StudioProjectState>(() =>
    makeInitialWizardState(),
  );
  const [contentTemplate, setContentTemplate] = useState<ContentTemplate>("basic");

  function patchState(patch: Partial<StudioProjectState>) {
    setState((prev) => ({ ...prev, ...patch }));
  }

  /** Apply a chosen template script to the wizard's working state. */
  function handleTemplateLoad(script: VideoScript) {
    patchState({ activeTemplate: script, script });
  }

  /** Apply a background preset to the wizard's working state — the
   *  wizard owns the picker, we just store the selection. */
  function handleBackgroundSelect(bgValue: string, customImageUrl?: string) {
    patchState({
      script: state.script
        ? {
            ...state.script,
            video: {
              ...state.script.video,
              theme: {
                ...state.script.video.theme,
                background: bgValue as "gradient" | "dark-tech-grid" | "particles" | "solid",
                customBackground: customImageUrl,
              },
            },
          }
        : state.script,
    });
  }

  /** Final step of the wizard — kick off generation, then create a
   *  draft + navigate to the editor. Errors stay in this scope so the
   *  wizard sees an awaited promise and shows its own error UI. */
  async function handleGenerate(): Promise<void> {
    try {
      patchState({ status: "generating" });
      const res = await studioService.generateStoryboard({
        resumeText: state.resumeText,
        resumeId: state.resumeId,
        prompt: state.prompt,
        jobDescription: state.jobDescription,
        targetDuration: state.targetDuration,
        resolution: state.resolution,
        motion: state.motion,
        purpose: state.purpose,
      });
      if (!res.data) throw new Error("No data returned");
      const script = res.data;
      patchState({ script, status: "ready" });
      await createDraftFromScript(script);
    } catch (err) {
      patchState({ status: "idle" });
      toast({
        title: "Couldn't generate",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  async function createDraftFromScript(script: VideoScript) {
    const timelineSpec = isV2
      ? canvasStateToTimeline(scriptToCanvasState(script))
      : undefined;
    const res = await studioService.saveDraft({
      name: state.name || "New Video",
      kind: isV2 ? "nle" : "scene",
      script: isV2 ? undefined : script,
      timelineSpec,
    });
    const created = res.data;
    if (!created?.id) throw new Error("No project id returned");
    setOpen(false);
    navigate(`/studio/${encodeURIComponent(created.id)}`);
  }

  return (
    <>
      {variant === "icon" ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setOpen(true)}
          aria-label="Open new video wizard"
          title="Open new video wizard"
          className={cn("h-8 w-8 p-0", className)}
        >
          <Wand2 className="h-4 w-4" />
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setOpen(true)}
          className={cn("gap-1", className)}
        >
          <Wand2 className="h-4 w-4" />
          Wizard
        </Button>
      )}
      <StudioWizard
        open={open}
        state={state}
        onStateChange={patchState}
        contentTemplate={contentTemplate}
        onContentTemplateSelect={setContentTemplate}
        onTemplateLoad={handleTemplateLoad}
        onBackgroundSelect={handleBackgroundSelect}
        onGenerate={handleGenerate}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

function makeInitialWizardState(): StudioProjectState {
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
