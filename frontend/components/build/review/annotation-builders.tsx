/**
 * Build the page annotations for the Changes view of a review (see
 * components/resume-renderer/annotations.tsx for what they render as).
 *
 *   marks   what the proposal adds / changes / drops vs the baseline —
 *           diffed, so bullet-level even when a change rewrote a whole list
 *   pins    one numbered pin per change, on the text it changed (a whole
 *           list → its entry; a whole section → the section); the
 *           selected one carries its popover
 *   cards   kind-specific controls (merge decisions, gap questions), added
 *           by the kind's builder (merge-annotations.tsx, job-annotations.tsx)
 *
 * Plain functions (no hooks): the cards they place are components that
 * own their own state.
 */
import { Fragment, type ReactNode } from "react";
import type { ResumeContent } from "@shared/resume";
import { entryPathOf, type ContentPath } from "@shared/resume-path";
import type { AnnotationKind, ResumeAnnotation } from "@/components/resume-renderer/annotations";
import { diffContent } from "@/lib/build/review/content-diff";
import type { ReviewChange } from "@/lib/build/review/review-model";

export type Mutable = Record<ContentPath, ResumeAnnotation>;

const RANK: Record<AnnotationKind, number> = { review: 5, changed: 4, added: 3, new: 2, removed: 1, pin: 0 };

const joinNodes = (a: ReactNode, b: ReactNode, key: string): ReactNode =>
  a && b ? (
    <>
      <Fragment key={`${key}-a`}>{a}</Fragment>
      <Fragment key={`${key}-b`}>{b}</Fragment>
    </>
  ) : (a ?? b);

/** Add `next` onto whatever is already at `path` (strongest kind wins;
 *  cards, chips and removed items accumulate). */
export function annotate(map: Mutable, path: ContentPath, next: ResumeAnnotation): void {
  const prev = map[path];
  if (!prev) {
    map[path] = next;
    return;
  }
  map[path] = {
    kind: RANK[next.kind] > RANK[prev.kind] ? next.kind : prev.kind,
    pin: prev.pin ?? next.pin,
    before: prev.before ?? next.before,
    card: joinNodes(prev.card, next.card, `${path}-c`),
    cardAfter: joinNodes(prev.cardAfter, next.cardAfter, `${path}-ca`),
    removedItems: [...(prev.removedItems ?? []), ...(next.removedItems ?? [])],
    chips: [...(prev.chips ?? []), ...(next.chips ?? [])],
    active: prev.active || next.active,
  };
}

/** Green / struck marks for everything `after` changes vs `before`. */
export function addMarks(map: Mutable, before: ResumeContent, after: ResumeContent): void {
  for (const c of diffContent(before, after)) {
    if (c.kind === "removed") {
      if (typeof c.removedValue === "string") annotate(map, c.path, { kind: "pin", removedItems: [c.before] });
      continue;
    }
    if (c.kind === "changed" && /^\w+\.\d+$/.test(c.path)) {
      annotate(map, c.path, { kind: "review" });
      continue;
    }
    annotate(map, c.path, c.kind === "changed" ? { kind: "changed", before: c.before } : { kind: c.path.split(".").length === 2 ? "new" : "added" });
  }
}

/** The other side of `addMarks`, for the compare panel's left page: what
 *  `after` drops or rewrites, struck on `before`. */
export function addRemovedMarks(map: Mutable, before: ResumeContent, after: ResumeContent): void {
  for (const c of diffContent(after, before)) {
    if (c.kind === "added" || (c.kind === "changed" && !/^\w+\.\d+$/.test(c.path))) annotate(map, c.path, { kind: "removed" });
  }
}

/** Where a change's pin sits on the page. */
export function pinAnchor(path: ContentPath): ContentPath {
  const segs = path.split(".");
  if (segs.length === 3 && segs[2] === "highlights") return entryPathOf(path) ?? path;
  return path;
}

/** Numbered pins for kept changes; the selected one gets `popover`.
 *  `remap` moves a path past entries hidden from the page (or drops it). */
export function addPins(
  map: Mutable,
  changes: readonly ReviewChange[],
  selectedId: string | null,
  popover: ReactNode,
  remap: (path: ContentPath) => ContentPath | null = (p) => p,
): void {
  for (const c of changes) {
    if (c.status !== "kept") continue;
    const path = remap(pinAnchor(c.path));
    if (!path) continue;
    const active = c.id === selectedId;
    annotate(map, path, { kind: "pin", pin: c.pin, active, cardAfter: active ? popover : undefined });
  }
}
