/**
 * useCreateStudioDraft — shared "start a new Studio video" primitive.
 *
 * Three callers used to inline the same `getTemplate → seedCanvasFromTemplate →
 * canvasStateToTimeline → saveDraft → navigate` sequence with subtly different
 * bookkeeping (StudioLanding's TemplateCarousel, NewVideoSplitButton's split
 * button, WizardLauncher's generated-script handoff). This hook owns the
 * shared pipeline so all three agree on:
 *
 *   - The editor-kind decision (`useEditorPreference().isV2 ? "nle" : "scene"`).
 *   - Seeded `timelineSpec` for v2 / `script` payload for v1.
 *   - The "last-used template" memory (`studio_default_template` localStorage
 *     key) — now updated whether the user picks from the dropdown OR the
 *     carousel, fixing the prior inconsistency where only the dropdown wrote.
 *   - Busy / error toast / success navigate.
 *
 * Consumers add ONLY their consumer-specific bookkeeping via `onCreated`
 * (e.g. optimistic prepend to a local Recent list, closing a modal).
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { useEditorPreference } from "@/lib/studio/editor-v2/preferences";
import { seedCanvasFromTemplate } from "@/lib/studio/editor-v2/template-seeds";
import { scriptToCanvasState } from "@/lib/studio/editor-v2/script-to-canvas";
import { canvasStateToTimeline } from "@/lib/studio/editor-v2/timeline-emit";
import {
  getTemplate,
  type ContentTemplate,
} from "@/components/studio/templates/catalog";
import { studioService, type StudioProject } from "@/lib/services/studio-service";
import type { VideoScript } from "@/types/video-script";

export type CreateStudioDraftInput =
  | { kind: "template"; templateId: ContentTemplate }
  | { kind: "script"; script: VideoScript; name?: string };

interface Opts {
  /** Fires once after a successful save, BEFORE navigate. Useful for
   *  optimistic local-cache prepends or closing a host modal. */
  onCreated?: (project: StudioProject) => void;
  /** Skip the internal navigate (caller does it). Default false. */
  skipNavigate?: boolean;
}

export function useCreateStudioDraft(opts: Opts = {}) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isV2 } = useEditorPreference();
  const [defaultTemplate, setDefaultTemplate] =
    usePersistentState<ContentTemplate>("studio_default_template", "basic");
  const [creating, setCreating] = useState(false);

  async function create(input: CreateStudioDraftInput): Promise<StudioProject | null> {
    if (creating) return null;
    setCreating(true);
    try {
      const projectKind = isV2 ? ("nle" as const) : ("scene" as const);
      if (input.kind === "template") {
        // Remember the user's last pick for the next split-button default.
        // Carousel + dropdown both flow through here so they stay in sync.
        setDefaultTemplate(input.templateId);
        const template = getTemplate(input.templateId);
        const timelineSpec = isV2
          ? canvasStateToTimeline(seedCanvasFromTemplate(input.templateId))
          : undefined;
        const res = await studioService.saveDraft({
          name: template.defaultName,
          kind: projectKind,
          timelineSpec,
        });
        return finalise(res.data);
      }
      // kind === "script" — wizard generated a v1 VideoScript; v2 projects
      // the canvas state through, v1 stores the raw script.
      const timelineSpec = isV2
        ? canvasStateToTimeline(scriptToCanvasState(input.script))
        : undefined;
      const res = await studioService.saveDraft({
        name: input.name || "New Video",
        kind: projectKind,
        script: isV2 ? undefined : input.script,
        timelineSpec,
      });
      return finalise(res.data);
    } catch (err) {
      toast({
        title: "Couldn't create video",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
      return null;
    } finally {
      setCreating(false);
    }
  }

  function finalise(created: StudioProject | undefined): StudioProject | null {
    if (!created?.id) throw new Error("No project id returned");
    opts.onCreated?.(created);
    if (!opts.skipNavigate) {
      navigate(`/studio/${encodeURIComponent(created.id)}`);
    }
    return created;
  }

  return { create, creating, defaultTemplate };
}
