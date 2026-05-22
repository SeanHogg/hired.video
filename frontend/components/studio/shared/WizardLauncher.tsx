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
 * yields a `VideoScript` which is handed to the shared
 * `useCreateStudioDraft` hook — that primitive owns the kind decision
 * (nle / scene), the timelineSpec projection, the `saveDraft` call,
 * and the navigate. The launcher only wires `onCreated` to close its
 * modal. Same hook is shared with `NewVideoSplitButton` + the
 * `StudioLanding` carousel (DRY).
 *
 * Self-gating: visible to any authenticated Studio user. No `canX`
 * boolean prop drilling.
 */
import { useState } from "react";
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
  getTemplate,
  type ContentTemplate,
} from "@/components/studio/templates/catalog";
import { studioService } from "@/lib/services/studio-service";
import { useCreateStudioDraft } from "@/lib/studio/use-create-studio-draft";
import { mediaKindUsesCanvasStateAuthoring } from "@shared/media-kinds";
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
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const { create } = useCreateStudioDraft({
    onCreated: () => setOpen(false),
  });
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
   *  wizard sees an awaited promise and shows its own error UI.
   *
   *  Dispatches on the active template's `mediaKind`: comics route
   *  through `studioService.generateComic` (returns a `ComicSpec`),
   *  every other kind keeps the existing storyboard path. The branch
   *  lives at the wizard level rather than inside the intake form per
   *  the DRY rule — the intake is a dumb data collector; orchestration
   *  belongs to whoever owns the lifecycle. */
  async function handleGenerate(): Promise<void> {
    const template = getTemplate(contentTemplate);
    try {
      patchState({ status: "generating" });
      if (template.mediaKind === "comic") {
        // Genre id is encoded in the template id (`comic_<genreId>`)
        // but the intake form lets the user override via the picker.
        // ComicIntake writes the override to `state.comicGenreId`; we
        // fall back to the template's encoded value when the form
        // hasn't been touched.
        const encodedGenre = contentTemplate.startsWith("comic_")
          ? contentTemplate.slice("comic_".length)
          : undefined;
        const res = await studioService.generateComic({
          prompt: state.prompt,
          genreId: state.comicGenreId ?? encodedGenre,
          protagonistName: state.comicProtagonistName,
          sourceKind: state.comicSourceKind ?? "auto",
          resumeId: state.resumeId,
        });
        if (!res.data) throw new Error("No data returned");
        patchState({ status: "ready" });
        await create({ kind: "comicSpec", spec: res.data.spec, name: state.name });
        return;
      }
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
      await create({ kind: "script", script, name: state.name });
    } catch (err) {
      patchState({ status: "idle" });
      toast({
        title: "Couldn't generate",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  return (
    <>
      {variant === "icon" ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setOpen(true)}
          aria-label="Open new project wizard"
          title="Open new project wizard"
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
