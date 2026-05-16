/**
 * useCreateStudioDraft — shared "start a new Studio video" primitive.
 *
 * Three callers used to inline the same `getTemplate → seedCanvasFromTemplate
 * → canvasStateToTimeline → saveDraft → navigate` sequence with subtly
 * different bookkeeping (StudioLanding's TemplateCarousel,
 * NewVideoSplitButton's split button, WizardLauncher's generated-script
 * handoff). This hook owns the shared pipeline so all three agree on:
 *
 *   - The editor-kind decision (`useEditorPreference().isV2 ? "nle" : "scene"`).
 *   - Seeded `timelineSpec` for v2 from `seedCanvasFromTemplate(id)`.
 *   - The "last-used template" memory (`studio_default_template` localStorage
 *     key) — now updated whether the user picks from the dropdown OR the
 *     carousel, fixing the prior inconsistency where only the dropdown wrote.
 *   - Busy / error toast / success navigate.
 *
 * Per the V1-deprecation memory: this hook seeds v2 drafts ONLY (the
 * editor of record). The legacy v1 `script: VideoScript` payload exists
 * only because the backend column still accepts it for old projects;
 * new drafts are minted with a v2 timelineSpec and no script.
 *
 * The single source of per-template canvas content is
 * [editor-v2/template-seeds.ts]. The same seed feeds the marketplace
 * press-play preview (TemplatePlayer) so visitors see EXACTLY what
 * they'll land on after clicking Use.
 *
 * The `kind: "script"` branch survives only as the bridge for legacy v1
 * VideoScript inputs (wizard-generated drafts + creator-published
 * templates whose `videoScript` column is still a v1 shape). When those
 * surfaces migrate to v2, this branch can be deleted.
 *
 * Consumers add ONLY their consumer-specific bookkeeping via `onCreated`
 * (e.g. optimistic prepend to a local Recent list, closing a modal).
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { StudioSubject } from "@shared/studio-subject";
import { useToast } from "@/hooks/use-toast";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { useEditorPreference } from "@/lib/studio/editor-v2/preferences";
import { scriptToCanvasState } from "@/lib/studio/editor-v2/script-to-canvas";
import {
  emptyCanvasState,
  type CanvasState,
} from "@/lib/studio/editor-v2/canvas-state";
import { seedCanvasFromTemplate } from "@/lib/studio/editor-v2/template-seeds";
import { canvasStateToTimeline } from "@/lib/studio/editor-v2/timeline-emit";
import {
  getTemplate,
  type ContentTemplate,
} from "@/components/studio/templates/catalog";
import { studioService, type StudioProject } from "@/lib/services/studio-service";
import type { VideoScript } from "@/types/video-script";

export type CreateStudioDraftInput =
  | { kind: "template"; templateId: ContentTemplate }
  | { kind: "script"; script: VideoScript; name?: string }
  /** Empty draft — used by the chooser's `?subject=` / `?capture=` /
   *  `?new=1` deep-link forwarder so external entry points mint the
   *  project server-side and land users on `/studio/<real-id>` instead
   *  of the legacy `/studio/new` sentinel. Optional `subjects` pre-links
   *  source entities (resume / job / company) on the first save. */
  | { kind: "blank"; name?: string; subjects?: StudioSubject[] };

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
        // The marketplace press-play preview mounts seedCanvasFromTemplate(id)
        // through the same canvas pipeline; passing the same seed into
        // saveDraft means the editor opens with the exact composition the
        // visitor just watched.
        const canvasSeed = seedCanvasFromTemplate(input.templateId);
        const timelineSpec = isV2
          ? canvasStateToTimeline(canvasSeed)
          : undefined;
        const res = await studioService.saveDraft({
          name: template.defaultName,
          kind: projectKind,
          timelineSpec,
        });
        return finalise(res.data);
      }
      if (input.kind === "blank") {
        const empty: CanvasState = emptyCanvasState();
        const timelineSpec = isV2 ? canvasStateToTimeline(empty) : undefined;
        const res = await studioService.saveDraft({
          name: input.name || "New Video",
          kind: projectKind,
          timelineSpec,
          // Subjects pre-link the project to source entities so the
          // editor's chip rail + EntityVideos rails on the source page
          // are populated from first paint.
          ...(input.subjects && input.subjects.length > 0
            ? { subjects: input.subjects }
            : {}),
        });
        return finalise(res.data);
      }
      // kind === "script" — legacy v1 VideoScript bridge for the wizard
      // and creator-template flows. Converts to v2 CanvasState on the
      // way in so saved projects are uniformly v2-shaped.
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
