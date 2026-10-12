/**
 * The editor's project record (title, persisted id + envelope, the
 * missing-project banner flag) and its load lifecycle: the server load
 * (incl. the career-kit redirect), the `?studioTemplate=` clone, and the
 * URL follow after a save mints a row. Lifted out of StudioEditorV2.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { kitResumeId } from "@shared/studio-subject";
import { useToast } from "@/hooks/use-toast";
import { studioService, type StudioProject } from "@/lib/services/studio-service";
import { NotFoundError } from "@/lib/errors";
import { kitResumePath, studioRouteState } from "@/lib/workspace/workspace-route";
import { loadStudioTemplateStart } from "@/lib/studio/studio-template-start";
import { projectCanvasState } from "./project-canvas-state";
import type { TimelineCanvas } from "./use-timeline-canvas";

/** The saved project id a `/studio/:id` route addresses — null for an
 *  unsaved `"new"` draft. */
export function savedProjectIdFromRoute(routeId: string): string | null {
  return routeId === "new" ? null : routeId;
}

export function useProjectRecord(projectId: string, untitledTitle: string) {
  const [title, setTitle] = useState<string>(untitledTitle);
  const [persistedProjectId, setPersistedProjectId] = useState<string | null>(
    savedProjectIdFromRoute(projectId),
  );
  // Full StudioProject envelope — keeps isPublic / subjects / videoUrl
  // around for the shared <ProjectChromeMenu>. Updated on every server
  // round-trip (load, save, clone, visibility toggle).
  const [persistedProject, setPersistedProject] = useState<StudioProject | null>(null);
  // Sticky banner shown when the route id resolves to nothing the caller
  // can read — the API returns 404 for both "doesn't exist" and "no
  // access" (deliberate, see studio.ts comment), so the message stays
  // generic. Setting this also nulls `persistedProjectId` above so the
  // first save creates a fresh project instead of trying to write under
  // the unreadable id.
  const [missingProject, setMissingProject] = useState(false);
  return {
    title,
    setTitle,
    persistedProjectId,
    setPersistedProjectId,
    persistedProject,
    setPersistedProject,
    missingProject,
    setMissingProject,
  };
}

export type ProjectRecord = ReturnType<typeof useProjectRecord>;

export interface StudioProjectLifecycleInput {
  projectId: string;
  /** The project the route already loaded, if any (not fetched again). */
  loadedProject: StudioProject | null;
  studioTemplateSlug: string | null;
  record: Pick<ProjectRecord, "setTitle" | "setPersistedProjectId" | "setPersistedProject" | "setMissingProject">;
  /** Replace the Timeline canvas with a loaded / cloned one. */
  loadCanvas: TimelineCanvas["loadCanvas"];
  loadScript: TimelineCanvas["loadScript"];
}

export function useStudioProjectLifecycle({
  projectId,
  loadedProject,
  studioTemplateSlug,
  record,
  loadCanvas,
  loadScript,
}: StudioProjectLifecycleInput) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { setTitle, setPersistedProjectId, setPersistedProject, setMissingProject } = record;

  // A save that minted the row moves the address to /studio/<id> with the
  // studio hand-off state (the route keeps this editor mounted) — and this
  // editor already holds that project, so it isn't loaded again.
  const followedSaveRef = useRef<string | null>(null);
  const followSavedProject = useCallback(
    (id: string) => {
      followedSaveRef.current = id;
      navigate(`/studio/${encodeURIComponent(id)}`, { replace: true, state: studioRouteState(id) });
    },
    [navigate],
  );

  // Server-load when we have a real project id.
  useEffect(() => {
    if (projectId === "new" || followedSaveRef.current === projectId) return;
    let cancelled = false;
    (async () => {
      try {
        const project =
          loadedProject?.id === projectId ? loadedProject : (await studioService.getProject(projectId)).data;
        if (cancelled) return;
        if (!project) {
          // API returns 404 with no body for both "doesn't exist" and
          // "exists but you can't read it" — we can't distinguish and
          // shouldn't try (would leak existence). Drop the user into a
          // fresh empty editor with a sticky banner explaining why, and
          // null out the persisted id so their first save creates a new
          // project instead of attempting to PATCH the unreadable one.
          setMissingProject(true);
          setPersistedProjectId(null);
          return;
        }
        // A career kit's project opens as its kit, never as a plain format
        // (the route reads it first; this covers a read that failed there).
        const kitResume = kitResumeId(project.subjects);
        if (kitResume) {
          navigate(kitResumePath(kitResume), { replace: true });
          return;
        }
        setMissingProject(false);
        setTitle(project.title);
        setPersistedProjectId(project.id);
        setPersistedProject(project);
        // v2 timeline, else the v1 script (project-canvas-state.ts).
        const hydrated = projectCanvasState(project);
        if (hydrated) {
          // Reset (not setState) so undo can't take the user below
          // the just-loaded server state — local-session history
          // against a different project's content would be confusing.
          loadCanvas(hydrated);
        }
      } catch (err) {
        if (cancelled) return;
        // NotFoundError on a project read = same UX as the null-body
        // case above (404 covers both missing + forbidden). Anything
        // else (network, schema mismatch) is worth surfacing loudly so
        // the user knows they're not just looking at a stale page.
        if (err instanceof NotFoundError) {
          setMissingProject(true);
          setPersistedProjectId(null);
          return;
        }
        toast({
          title: t("studio.editor.loadProjectFailed"),
          description: err instanceof Error ? err.message : t("errors.unknownError"),
          variant: "destructive",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // `loadedProject` is the same row the route read for this id.
  }, [projectId, toast, loadCanvas, t]);

  // Apply `?studioTemplate=<slug>` once on mount when present. The
  // marketplace's "Use this template" button (use-apply-template) emits
  // this URL for studio-creator kind; v1 already handles it via
  // StudioLayout. Mirror behaviour here so v2 users can clone creator
  // templates instead of dead-ending in an empty canvas (#630).
  useEffect(() => {
    if (!studioTemplateSlug || projectId !== "new") return;
    let cancelled = false;
    (async () => {
      try {
        const start = await loadStudioTemplateStart(studioTemplateSlug);
        if (cancelled) return;
        if (!start) {
          toast({
            title: t("studio.editor.templateNoContentTitle"),
            description: t("studio.editor.templateNoContentDesc"),
            variant: "destructive",
          });
          return;
        }
        if (start.kind !== "script") {
          // A document / résumé template isn't a Timeline canvas: the /studio
          // entry handler mints its project (or opens the career kit).
          navigate(`/studio?studioTemplate=${encodeURIComponent(studioTemplateSlug)}`, { replace: true });
          return;
        }
        loadScript(start.script);
        setTitle(start.name);
      } catch (err) {
        toast({
          title: t("studio.editor.loadTemplateFailed"),
          description: err instanceof Error ? err.message : t("errors.unknownError"),
          variant: "destructive",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studioTemplateSlug, projectId, toast, loadScript, navigate, t]);

  return { followSavedProject };
}
