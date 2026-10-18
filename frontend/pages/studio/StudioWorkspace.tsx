/**
 * eslint-page-chrome: skip — full-screen workspace (the editor's own frame
 * replaces the marketing chrome; each view sets its own SEO).
 *
 * StudioWorkspace — the ONE route component for every workspace URL
 * (App.tsx mounts it for /studio/new, /studio/resume/:resumeId and
 * /studio/:id). It resolves the URL (lib/workspace/workspace-route.ts) and
 * renders a career kit (KitWorkspace) or a studio format (StudioEditorV2) in
 * the same frame. Because the three routes render this same component, a
 * kit's address moving from /studio/new to /studio/<projectId> keeps the
 * workspace mounted. Two more rules keep it mounted:
 *   - a URL that reloads the project already on screen (any replace that
 *     dropped the hand-off state) keeps the current view;
 *   - only a PUSH or a Back/Forward to another path opens a fresh kit (a
 *     tool opening another résumé, "New kit", Back to the previous kit) —
 *     replaces (entry clean-up, hand-offs) never do.
 */
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useLocation, useNavigationType, useParams, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { kitResumeId } from "@shared/studio-subject";
import { studioService, type StudioProject } from "@/lib/services/studio-service";
import { readAfterGuestAdoption } from "@/lib/guest-adoption";
import { queryKeys } from "@/lib/query-keys";
import { resolveWorkspaceRoute } from "@/lib/workspace/workspace-route";
import StudioLoadingShell from "./StudioLoadingShell";

const KitWorkspace = lazy(() => import("@/components/workspace/kit/KitWorkspace"));
const StudioEditorV2 = lazy(() => import("./v2/StudioEditorV2"));

type Loaded = { id: string; project: StudioProject | null };

/** /studio/:id with no hand-off state: read the project once to tell a kit
 *  from a format. A failed read falls through to the editor, which shows
 *  its own "can't open this project" banner. Just signed in from a guest
 *  session: retried once the guest's work is claimed. */
function useLoadedProject(projectId: string | null): Loaded | null {
  const queryClient = useQueryClient();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    readAfterGuestAdoption(() => studioService.getProject(projectId))
      .then((res) => {
        const project = res.data ?? null;
        // Seed the shared row (useStudioProjectRow — KitHeader, document
        // layers) so the kit that mounts next doesn't GET the same project
        // again. Only a real row: a failed read leaves the cache to retry.
        if (project) queryClient.setQueryData(queryKeys.studioProject.byId(projectId), project);
        if (!cancelled) setLoaded({ id: projectId, project });
      })
      .catch(() => !cancelled && setLoaded({ id: projectId, project: null }));
    return () => {
      cancelled = true;
    };
  }, [projectId, queryClient]);
  return loaded && loaded.id === projectId ? loaded : null;
}

type View = { kit: { projectId: string | null; resumeId: string | null } } | { studio: StudioProject | null };

function viewProjectId(view: View, studioId: string | null): string | null {
  return "kit" in view ? view.kit.projectId : studioId;
}

/** Bumps on each PUSH or POP (Back / Forward) to a different path — the
 *  kit's remount key; a REPLACE (hand-off, entry clean-up) keeps it. */
function useFreshKitKey(): number {
  const location = useLocation();
  const navigationType = useNavigationType();
  const seen = useRef({ key: location.key, path: location.pathname, count: 0 });
  if (seen.current.key !== location.key) {
    const moved = seen.current.path !== location.pathname;
    seen.current = {
      key: location.key,
      path: location.pathname,
      count: seen.current.count + (navigationType !== "REPLACE" && moved ? 1 : 0),
    };
  }
  return seen.current.count;
}

export default function StudioWorkspace() {
  const { id, resumeId } = useParams<{ id?: string; resumeId?: string }>();
  const [params] = useSearchParams();
  const location = useLocation();
  const route = resolveWorkspaceRoute({ projectId: id, resumeId, params, state: location.state });
  const kitKey = useFreshKitKey();
  // The view on screen and the project it holds — a "load" of that same
  // project keeps it instead of tearing the workspace down.
  const shown = useRef<{ view: View; projectId: string | null } | null>(null);
  const keep = route.kind === "load" && shown.current?.projectId === route.projectId ? shown.current : null;
  const loaded = useLoadedProject(route.kind === "load" && !keep ? route.projectId : null);

  let view: View | null;
  if (keep) view = keep.view;
  else if (route.kind === "kit") view = { kit: { projectId: route.projectId, resumeId: route.resumeId } };
  else if (route.kind === "studio") view = { studio: null };
  else if (!loaded) view = null;
  else {
    const kitResume = kitResumeId(loaded.project?.subjects);
    view = kitResume ? { kit: { projectId: route.projectId, resumeId: kitResume } } : { studio: loaded.project };
  }
  if (view) shown.current = { view, projectId: viewProjectId(view, id && id !== "new" ? id : null) };

  return (
    <Suspense fallback={<StudioLoadingShell />}>
      {view === null ? (
        <StudioLoadingShell />
      ) : "kit" in view ? (
        <KitWorkspace key={kitKey} projectId={view.kit.projectId} resumeId={view.kit.resumeId} />
      ) : (
        <StudioEditorV2 loadedProject={view.studio} />
      )}
    </Suspense>
  );
}
