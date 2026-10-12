/**
 * "Your work" on the studio home — ONE list of everything the viewer made:
 * a kit per résumé (its cover letter + video ride along, see kits.ts) and
 * every other studio project. Built in memory from the two lists the home
 * already loads; a kit's own video is not repeated as a project row (the
 * caller passes projects with those ids already left out).
 *
 * Pure (no React) so the merge + filter are unit-testable.
 */
import type { StudioProject } from "@/lib/services/studio-service";
import { isProjectPosted, type KitRow } from "@/lib/workspace/kits";

export type WorkItem =
  | { kind: "kit"; id: string; updatedAt: string; posted: boolean; kit: KitRow }
  | { kind: "project"; id: string; updatedAt: string; posted: boolean; project: StudioProject };

export type WorkFilter = "all" | "kits" | "other" | "posted" | "drafts";

/** Filter pills in display order. */
export const WORK_FILTERS: readonly WorkFilter[] = ["all", "kits", "other", "posted", "drafts"];

/** Kits + projects, newest edit first. `query` narrows kits by title (the
 *  projects arrive already searched by useMyContent). */
export function buildWorkItems(
  kits: readonly KitRow[] | null,
  projects: readonly StudioProject[],
  query: string,
): WorkItem[] {
  const q = query.trim().toLowerCase();
  const kitItems: WorkItem[] = (kits ?? [])
    .filter((kit) => !q || kit.title.toLowerCase().includes(q))
    .map((kit) => ({
      kind: "kit",
      id: `kit:${kit.resumeId}`,
      updatedAt: kit.updatedAt,
      posted: kit.video?.posted === true,
      kit,
    }));
  const projectItems: WorkItem[] = projects.map((project) => ({
    kind: "project",
    id: project.id,
    updatedAt: project.updateDateTime,
    posted: isProjectPosted(project),
    project,
  }));
  return [...kitItems, ...projectItems].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function filterWorkItems(items: readonly WorkItem[], filter: WorkFilter): WorkItem[] {
  switch (filter) {
    case "kits":
      return items.filter((item) => item.kind === "kit");
    case "other":
      return items.filter((item) => item.kind === "project");
    case "posted":
      return items.filter((item) => item.posted);
    case "drafts":
      return items.filter((item) => !item.posted);
    default:
      return [...items];
  }
}

/** The projects among `items` (what the bulk Delete / Merge bar acts on). */
export function workProjects(items: readonly WorkItem[]): StudioProject[] {
  return items.flatMap((item) => (item.kind === "project" ? [item.project] : []));
}
