/**
 * StudioAiWizard — the 3-step StudioWizard modal ("Start with AI" in the
 * studio's New menu), translating its completion (a generated VideoScript,
 * a comic spec or a template seed) into a freshly-created Studio project
 * that the workspace then opens. Controlled: the New menu opens it.
 *
 * It manages all state the wizard needs locally:
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
 * modal. Same hook is shared with the New menu and the studio home's
 * template carousel (DRY).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
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
} from "@/lib/studio/templates/catalog";
import { studioService } from "@/lib/services/studio-service";
import { useCreateStudioDraft } from "@/lib/studio/use-create-studio-draft";
import { mediaKindUsesCanvasStateAuthoring } from "@shared/media-kinds";

export interface StudioAiWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function StudioAiWizard({ open, onOpenChange }: StudioAiWizardProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const setOpen = onOpenChange;
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
   *  Dispatches on the active template's `mediaKind`:
   *    • comic → `studioService.generateComic` → `kind: "comicSpec"`
   *    • CanvasState-authoring kinds (video / podcast / voice) →
   *      `generateStoryboard` → `kind: "script"`. The
   *      `mediaKindUsesCanvasStateAuthoring` predicate (#936) gates
   *      this so adding a new non-CanvasState runtime doesn't quietly
   *      take the storyboard path.
   *    • Non-CanvasState kinds (game, image, animation) → seed the
   *      project from the template registry via `kind: "template"` —
   *      no AI storyboard generation; these kinds bring their own
   *      state shape (`gameState` / `imageState` / `animationState`)
   *      and runtime-specific tooling. Skipping the storyboard call
   *      was the root cause of the "Couldn't create project" toast
   *      for drawing templates (#961) — animation joined this branch
   *      via #1003.
   *
   *  The branch lives at the wizard level rather than inside the
   *  intake form per the DRY rule — the intake is a dumb data
   *  collector; orchestration belongs to whoever owns the lifecycle. */
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
        if (!res.data) throw new Error(t("errors.unknownError"));
        patchState({ status: "ready" });
        await create({ kind: "comicSpec", spec: res.data.spec, name: state.name });
        return;
      }
      // Non-CanvasState authoring kinds (game / image / future cad /
      // 3d_model) don't have a Timeline-shaped storyboard the
      // AI can scaffold — they're seeded directly from the per-kind
      // template registry (`seedTemplate()` in `template-dispatch.ts`).
      // Routing them through the storyboard generator would either
      // fail or mint a wrong-shaped project; route them through the
      // template seed branch instead.
      if (!mediaKindUsesCanvasStateAuthoring(template.mediaKind)) {
        patchState({ status: "ready" });
        await create({ kind: "template", templateId: contentTemplate });
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
      if (!res.data) throw new Error(t("errors.unknownError"));
      const script = res.data;
      patchState({ script, status: "ready" });
      await create({ kind: "script", script, name: state.name });
    } catch (err) {
      patchState({ status: "idle" });
      toast({
        title: t("workspace.wizard.generateFailed"),
        description: err instanceof Error ? err.message : t("errors.unknownError"),
        variant: "destructive",
      });
    }
  }

  return (
    <>
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
    videoBlob: null,
    videoUrl: null,
    thumbnailUrl: null,
    projectId: null,
    youtubeVideoId: null,
  };
}
