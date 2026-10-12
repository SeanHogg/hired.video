/**
 * Merge Studio projects — the /studio "Merge" bulk action's use case.
 *
 * Creates a NEW draft whose canvas is the selected projects concatenated in
 * order (see `mergeCanvasStates`); the source projects are left untouched so
 * a merge is never destructive. Subject links are unioned so a merged résumé
 * video stays attached to every entity its parts were attached to.
 */
import { mediaKindUsesCanvasStateAuthoring, type MediaKind } from "@shared/media-kinds";
import { studioService, type StudioProject } from "@/lib/services/studio-service";
import { mergeCanvasStates } from "./editor-v2/merge-canvas-states";
import { canvasStateToTimeline, timelineToCanvasState } from "./editor-v2/timeline-emit";

/** Why a selection can't be merged — an i18n key suffix under
 *  `messages.studioMerge.blocked.*`, or null when mergeable. */
export type MergeBlocker = "tooFew" | "mixedKinds" | "unsupportedKind";

/** Kinds whose canvas is a linear CanvasState scene list. Comic+ is excluded:
 *  its branching choice graph can't be concatenated meaningfully. */
function isMergeableKind(kind: MediaKind): boolean {
  return kind !== "interactive_comic" && mediaKindUsesCanvasStateAuthoring(kind);
}

export function mergeBlocker(
  projects: ReadonlyArray<Pick<StudioProject, "kind" | "mediaKind">>,
): MergeBlocker | null {
  if (projects.length < 2) return "tooFew";
  const kinds = new Set(projects.map((p) => p.mediaKind ?? "video"));
  if (kinds.size > 1) return "mixedKinds";
  const [kind] = kinds;
  if (!isMergeableKind(kind) || projects.some((p) => p.kind !== "nle")) {
    return "unsupportedKind";
  }
  return null;
}

export async function mergeStudioProjects(
  projects: readonly StudioProject[],
  title: string,
): Promise<StudioProject> {
  const blocker = mergeBlocker(projects);
  if (blocker) throw new Error(`Projects can't be merged (${blocker})`);

  // Re-read each source so the merge uses the latest saved canvas, not a
  // possibly-stale list row.
  const fresh = await Promise.all(projects.map((p) => studioService.getProject(p.id)));
  const states = fresh.map((res) => timelineToCanvasState(res.data?.timelineSpec));
  const merged = mergeCanvasStates(states);

  const subjects = new Map<string, { kind: string; id: string }>();
  for (const res of fresh) {
    for (const s of res.data?.subjects ?? []) subjects.set(`${s.kind}:${s.id}`, s);
  }

  const created = await studioService.saveDraft({
    name: title,
    kind: "nle",
    mediaKind: projects[0].mediaKind ?? "video",
    timelineSpec: canvasStateToTimeline(merged),
    ...(subjects.size > 0 ? { subjects: Array.from(subjects.values()) } : {}),
  });
  if (!created.data) throw new Error("Merged draft was not returned");
  return created.data;
}
