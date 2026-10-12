/**
 * useChangeList — Keep / Revert / Edit over a list of path-anchored changes,
 * and the résumé that results. Shared by every review whose proposal is a
 * set of edits (tailor, create from a job, a chat revision); merge has its
 * own decisions (use-merge-review.ts).
 *
 *   final = proposal, with each Edit written at its path, then every
 *           reverted change undone against the baseline (content-diff.ts).
 *
 * Changes start Kept: the person reviews what was done, not a blank slate.
 */
import { useCallback, useMemo, useState } from "react";
import type { ResumeContent } from "@shared/resume";
import { readAt, writeAt } from "@shared/resume-path";
import { revertChanges, type ContentChange } from "./content-diff";
import type { ChangeStatus, ReviewChange } from "./review-model";

export type AnchoredChange = ContentChange & { why?: string };

function applyEdits(proposed: ResumeContent, changes: readonly AnchoredChange[], edits: Record<string, string>): ResumeContent {
  let out = proposed;
  for (const c of changes) {
    const text = edits[c.id];
    if (text === undefined) continue;
    const current = readAt(out, c.path);
    const value = Array.isArray(current) ? text.split("\n").map((l) => l.trim()).filter(Boolean) : text;
    out = writeAt(out, c.path, value);
  }
  return out;
}

/** A change can be edited in place when it points at text or a bullet list. */
export function isEditable(content: ResumeContent, path: string): boolean {
  const v = readAt(content, path);
  return typeof v === "string" || (Array.isArray(v) && v.every((x) => typeof x === "string"));
}

export function useChangeList(
  baseline: ResumeContent | null,
  proposed: ResumeContent | null,
  changes: readonly AnchoredChange[],
) {
  const [reverted, setReverted] = useState<ReadonlySet<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, string>>({});

  const reset = useCallback(() => {
    setReverted(new Set());
    setEdits({});
  }, []);

  const final = useMemo(() => {
    if (!baseline || !proposed) return null;
    const edited = applyEdits(proposed, changes, edits);
    return revertChanges(edited, baseline, changes.filter((c) => reverted.has(c.id)));
  }, [baseline, proposed, changes, edits, reverted]);

  const list: ReviewChange[] = useMemo(
    () =>
      changes.map((c, i) => ({
        id: c.id,
        path: c.path,
        section: c.section,
        before: c.before,
        after: edits[c.id] ?? c.after,
        why: c.why,
        status: (reverted.has(c.id) ? "reverted" : "kept") as ChangeStatus,
        pin: i + 1,
      })),
    [changes, edits, reverted],
  );

  const setChange = useCallback((id: string, status: ChangeStatus) => {
    setReverted((prev) => {
      const next = new Set(prev);
      if (status === "reverted") next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const setAll = useCallback(
    (status: ChangeStatus) => setReverted(status === "reverted" ? new Set(changes.map((c) => c.id)) : new Set()),
    [changes],
  );

  const editChange = useCallback((id: string, text: string) => {
    setEdits((prev) => ({ ...prev, [id]: text }));
    setChange(id, "kept");
  }, [setChange]);

  const keptCount = changes.length - reverted.size;
  return { final, list, setChange, setAll, editChange, keptCount, reset };
}
