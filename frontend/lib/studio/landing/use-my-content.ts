/**
 * useMyContent — the /studio "Your work" data layer.
 *
 * Owns the viewer's studio projects (fetched per workspace selection;
 * signed-out visitors skip the 401-bound fetch and get an empty list), the
 * kit rows derived from the same projects, the ONE "Your work" list both
 * make (work-items.ts — a kit's own video is its kit row, not a second
 * project row) with its All / Kits / Other / Posted / Drafts filter and the
 * live search, the bulk-selection scope, and the local-state patches after
 * a rename / delete / merge / create. The single details drawer + delete confirm
 * targets live here too so every card in the section shares one instance.
 *
 * `enabled: false` (a deep link is redirecting) defers the fetch until the
 * page actually shows.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { useIdSelection } from "@/hooks/use-id-selection";
import { useAuth } from "@/lib/auth";
import { studioService, type StudioProject } from "@/lib/services/studio-service";
import { selectionToQuery, useWorkspace } from "@/lib/hooks/useWorkspace";
import { useKitRows } from "@/lib/workspace/use-kit-rows";
import { buildWorkItems, filterWorkItems, type WorkFilter } from "./work-items";

export function useMyContent(query: string, { enabled }: { enabled: boolean }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { selection } = useWorkspace();
  const workspaceQuery = selectionToQuery(selection);
  const [projects, setProjects] = useState<StudioProject[] | null>(null);
  const [loading, setLoading] = useState(true);
  // "Your work" filter — independent from the templates-section filters.
  const [workFilter, setWorkFilter] = useState<WorkFilter>("all");
  // Single drawer mounted at the page root — cards open it by setting
  // `detailsProject`. Avoids N drawers in the DOM for a long video grid.
  const [detailsProject, setDetailsProject] = useState<StudioProject | null>(null);
  // Same pattern for the delete confirm — one AlertDialog instance, cards
  // flip the target to request confirmation.
  const [deletingProject, setDeletingProject] = useState<StudioProject | null>(null);

  useEffect(() => {
    if (!enabled) return;
    // Signed-out visitors have nothing saved — skip the (401-bound) fetch and
    // render an empty "Your work" with a sign-up prompt instead.
    if (!user) {
      setProjects([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await studioService.getProjects(undefined, workspaceQuery);
        if (!cancelled) setProjects(res.data ?? []);
      } catch (err) {
        if (!cancelled) {
          toast({
            title: t("messages.studioLanding.loadProjectsFailed"),
            description: err instanceof Error ? err.message : t("errors.unknownErrorAdmin"),
            variant: "destructive",
          });
          setProjects([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast, workspaceQuery, user, enabled]);

  const { rows: kitRows, shownVideoIds: kitVideoIds } = useKitRows(projects);

  // Every item, before the filter pill — drives "nothing yet" vs "nothing
  // matches" in the empty state.
  const allWorkItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    const otherProjects = (projects ?? []).filter(
      // A kit's video is its kit row (older copies and videos whose résumé
      // is gone stay as project rows, to open or delete). The single primary
      // search narrows this list too (#1917).
      (p) => !kitVideoIds.has(p.id) && (!q || p.title.toLowerCase().includes(q)),
    );
    return buildWorkItems(kitRows, otherProjects, query);
  }, [projects, kitRows, kitVideoIds, query]);
  const workItems = useMemo(() => filterWorkItems(allWorkItems, workFilter), [allWorkItems, workFilter]);

  // Multi-select for the bulk Delete / Merge bar. Cleared whenever the
  // visible scope changes so a bulk action never touches hidden rows.
  const contentSelection = useIdSelection([workFilter, query, workspaceQuery]);
  const selectedProjects = useMemo(() => {
    const byId = new Map((projects ?? []).map((p) => [p.id, p]));
    return contentSelection.ids
      .map((id) => byId.get(id))
      .filter((p): p is StudioProject => p !== undefined);
  }, [projects, contentSelection.ids]);

  const totalWorkCount = allWorkItems.length;

  // Optimistic prepend so the user sees their new project in "Your work"
  // if they navigate back (the page's shared `create` calls this).
  function prependProject(created: StudioProject) {
    setProjects((prev) => (prev ? [created, ...prev] : [created]));
  }

  // Local-state drop after a (single or bulk) delete.
  function removeProjects(deletedIds: string[]) {
    const gone = new Set(deletedIds);
    setProjects((prev) => (prev ? prev.filter((p) => !gone.has(p.id)) : prev));
    contentSelection.remove(deletedIds);
    setDeletingProject(null);
    setDetailsProject((cur) => (cur && gone.has(cur.id) ? null : cur));
  }

  // Local-state patch after a project mutation (rename, SEO save). Keeps
  // the card grid in sync without a re-fetch.
  function patchProject(next: StudioProject) {
    setProjects((prev) =>
      prev ? prev.map((p) => (p.id === next.id ? next : p)) : prev,
    );
    setDetailsProject((cur) => (cur && cur.id === next.id ? next : cur));
  }

  // Bulk merge result lands at the front and clears the selection.
  function addMerged(merged: StudioProject) {
    setProjects((prev) => (prev ? [merged, ...prev] : [merged]));
    contentSelection.clear();
  }

  return {
    signedIn: !!user,
    // Both lists must be in before "Your work" renders, or kits would pop in
    // above projects a beat later (kits are null until the résumés load).
    loading: loading || (!!user && kitRows === null),
    workItems,
    totalWorkCount,
    workFilter,
    setWorkFilter,
    contentSelection,
    selectedProjects,
    detailsProject,
    setDetailsProject,
    deletingProject,
    setDeletingProject,
    prependProject,
    removeProjects,
    patchProject,
    addMerged,
  };
}

export type MyContent = ReturnType<typeof useMyContent>;

/** What the "Your work" list (YourWorkSection) reads. */
export type YourWorkList = Pick<
  MyContent,
  | "signedIn"
  | "loading"
  | "workItems"
  | "totalWorkCount"
  | "workFilter"
  | "setWorkFilter"
  | "contentSelection"
  | "selectedProjects"
  | "setDetailsProject"
  | "setDeletingProject"
  | "removeProjects"
  | "patchProject"
  | "addMerged"
>;

/** What the page-root details drawer + delete confirm (MyContentDialogs) read. */
export type MyContentDialogState = Pick<
  MyContent,
  | "detailsProject"
  | "setDetailsProject"
  | "deletingProject"
  | "setDeletingProject"
  | "patchProject"
  | "removeProjects"
>;
