/**
 * useCreateStudioDraft — shared "start a new Studio video" primitive.
 *
 * Three callers used to inline the same `getTemplate → seedFromDemoScript →
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
 * Per the user's "templates carry realistic values, not empty recipes"
 * rule, both `kind: "template"` and `kind: "script"` collapse to the same
 * server call: feed a VideoScript to saveDraft + scriptToCanvasState. For
 * the template branch the script comes from `TemplateDef.demoScript` — the
 * same VideoScript shown on the marketplace preview page — so users land
 * in the editor with the content they just watched in the preview.
 *
 * Consumers add ONLY their consumer-specific bookkeeping via `onCreated`
 * (e.g. optimistic prepend to a local Recent list, closing a modal).
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { useEditorPreference } from "@/lib/studio/editor-v2/preferences";
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
      // Both branches resolve to a {script, name} pair. The template
      // branch additionally records the user's pick as the new default
      // and pulls the realistic demo content off the catalog entry; the
      // script branch (wizard / marketplace creator templates) supplies
      // its own script. Either way the saveDraft payload + seed pipeline
      // is identical — one path, one place to update.
      let script: VideoScript;
      let name: string;
      if (input.kind === "template") {
        setDefaultTemplate(input.templateId);
        const template = getTemplate(input.templateId);
        script = template.demoScript;
        name = template.defaultName;
      } else {
        script = input.script;
        name = input.name || "New Video";
      }
      const timelineSpec = isV2
        ? canvasStateToTimeline(scriptToCanvasState(script))
        : undefined;
      const res = await studioService.saveDraft({
        name,
        kind: projectKind,
        script: isV2 ? undefined : script,
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
